import { load } from "js-yaml";
import { createWriteStream, existsSync, mkdirSync, readFileSync, rmSync } from "fs";
import Docker from "dockerode";
import { clone } from "./git.mjs";
import assert from "assert";
import { mappings } from "./cache.mjs";
import path from "path";
import { Stream } from "stream";
import micromatch from "micromatch";
import * as readline from "readline";
import process, { stderr } from "process";
import { populateVariables } from "./variables.mjs";
import tar from "tar";
import fs from "fs";

const docker = new Docker();

async function ask(prompt) {
    var rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
    return new Promise((resolve) => {
        rl.question(prompt, (input) => {
            rl.close();
            resolve(input);
        });
    });
}

async function pollForExitCode(exec) {
    return new Promise((resolve) => {
        async function _exec() {
            exec.inspect()
                .then((data) => {
                    if (data.Running) {
                        setTimeout(_exec, 100);
                    } else {
                        resolve(data.ExitCode);
                    }
                });
        }
        _exec();
    });
}

async function pull(image) {
    return docker.pull(image)
        .then((stream) => {
            docker.modem.followProgress(stream, onFinished, onProgress);

            function onFinished(_err, output) {
                console.log(output);
            }

            function onProgress(event) {
                console.log(event);
            }

            return new Promise((resolve) => {
                stream.on("end", () => {
                    resolve();
                });
            });
        });
}

async function getCommandResponse(container, command) {
    var exec = await container.exec({
        Cmd: ["sh", "-c", command],
        AttachStdin: false,
        AttachStdout: true,
        AttachStderr: true,
    });
    var logStream = await exec.start({ hijack: true });

    var ws = new Stream;
    ws.writable = true;
    var responseString = "";

    ws.write = function (buf) {
        responseString += buf.toString();
        ws.bytes += buf.length;
    };

    ws.end = function (buf) {
        if (arguments.length) ws.write(buf);
        ws.writable = false;
    };

    container.modem.demuxStream(logStream, ws, stderr);
    var exitCode = await pollForExitCode(exec);
    logStream.destroy();
    if (exitCode != 0) {
        throw new Error(`Failed to execute command '${command}'`);
    }

    return Promise.resolve(responseString.trim());
}

async function executeInstruction(container, instruction) {
    var exec = await container.exec({
        Cmd: ["sh", "-c", instruction],
        AttachStdin: false,
        AttachStdout: true,
        AttachStderr: true,
    });
    var logStream = await exec.start({ hijack: true });

    var stdOutStream = new Stream;
    console.group();
    stdOutStream.writable = true;
    stdOutStream.write = function (buf) {
        console.log(buf.toString());
    };
    stdOutStream.end = function (buf) {
        if (arguments.length)
            console.log(buf.toString());
        stdOutStream.writable = false;
    };

    container.modem.demuxStream(logStream, stdOutStream, stdOutStream);
    var exitCode = await pollForExitCode(exec);
    logStream.destroy();
    console.groupEnd();
    return Promise.resolve(exitCode);
}

async function executeStep(opts, gitConfig, pipelineFile, step, customVariables) {
    console.log(`[${step.name}]`);

    let container = await buildContainer(opts, gitConfig, pipelineFile, step, customVariables);

    async function compressArtifacts(step) {
        let artifactsGlobs = step.artifacts?.paths || step.artifacts;
        if (!artifactsGlobs) return;

        let fileList = (await getCommandResponse(container, "find ."))
            .split("\n")
            .map(i => i.substring(2).trim());

        let artifactFiles = micromatch(fileList, artifactsGlobs);
        console.log("Artifacts: %d files found.", artifactFiles.length);
        var command = "cat <<EOT >> /tmp/artifacts.txt\n" + artifactFiles.join("\n") + "\nEOT";

        var exitCode = await executeInstruction(container, command);
        if (exitCode != 0) {
            throw new Error("Unable to export artifact list");
        }

        exitCode = await executeInstruction(container, "tar -cf /tmp/artifacts.tar -T /tmp/artifacts.txt");
        if (exitCode != 0) {
            throw new Error("Unable to tar artifacts");
        }

        await saveArchive(opts.artifacts, "/tmp/artifacts.tar");
        //TODO: merge tar files in the even download==false
    }

    async function cleanUpContainer() {
        console.log("Cleaning up containers");
        await container.stop();
        await container.remove();
    }

    async function runMultipleSteps(steps) {
        for (let instruction of steps) {
            console.log(`[${step.name}] ${instruction}`);
            var returnCode = await executeInstruction(container, instruction);
            if (returnCode != 0) {
                console.log(`[${step.name}] ${instruction} -> ${returnCode}`);
                return Promise.resolve(true);
            }
        }
        return Promise.resolve(false);
    }

    async function runAfterScript() {
        if (!step["after-script"]) return Promise.resolve();

        console.log(`[${step.name}] After Script`);
        try {
            return runMultipleSteps(step["after-script"]);
        } catch (e) {
            console.log("Error running after-script", e);
        }
        return Promise.resolve();
    }

    async function getRealPath(pathname) {
        return getCommandResponse(container, "realpath -m " + pathname);
    }

    async function saveArchive(tarFile, sourcePath) {
        try {
            console.log("Cache: saving '%s' from '%s'", tarFile, sourcePath);
            let readStream = await container.getArchive({ path: sourcePath });
            var writeStream = createWriteStream(tarFile);
            readStream.pipe(writeStream);
            return Promise.resolve();
        } catch (e) {
            if (e.statusCode === 404) {
                return Promise.resolve();
            } else {
                throw e;
            }
        }
    }

    async function putArchive(tarFile, destinationPath) {
        if (existsSync(tarFile)) {
            console.log("Cache: uploading '%s' to '%s'", tarFile, destinationPath);
            return await container.putArchive(tarFile, { path: path.dirname(destinationPath) });
        } else {
            console.log("Cache: '%s' does not exist, skipping", tarFile);
            return Promise.resolve();
        }
    }

    async function getCachePaths() {
        let paths = (step.caches || [])
            .map((name) => { return { name, destinationPath: mappings[name] || pipelineFile.definitions.caches[name] }; })
            .filter(n => n.destinationPath);

        for (let p of paths) {
            p.destinationPath = await getRealPath(p.destinationPath);
        }

        return paths;
    }

    process.on("exit", cleanUpContainer);

    await container.start();

    let cachePaths = await getCachePaths();

    if (opts.keys) {
        console.log(`[${step.name}] Copying local ssh folder from %s into container`, opts.keys);
        const tarStream = tar.c(
            {
                gzip: true,
                sync: true,
                cwd: opts.keys
            },
            ["."]
        );
        await runMultipleSteps(["mkdir /tmp/.ssh/"]);
        await container.putArchive(tarStream.read(), { path: "/tmp/.ssh/" });
        await runMultipleSteps([
            "cp -R /tmp/.ssh ~/.ssh",
            "chmod 700 ~/.ssh",
            "chmod 644 ~/.ssh/id_rsa.pub",
            "chmod 600 ~/.ssh/id_rsa"
        ]);
    }

    for (let i of cachePaths) {
        await putArchive(`${opts.cache}/${i.name}.tar`, i.destinationPath);
    }

    if (!(step.artifacts?.download == false)) {
        await putArchive(opts.artifacts, ".");
    }

    try {
        return await runMultipleSteps(step.script);
    } finally {
        await runAfterScript();

        for (let i of cachePaths) {
            await saveArchive(`${opts.cache}/${i.name}.tar`, i.destinationPath);
        }

        compressArtifacts(step);
        cleanUpContainer();

        process.removeListener("exit", cleanUpContainer);
    }
}

async function buildContainer(opts, gitConfig, pipelineFile, step, customVariables) {
    var image = step.image || pipelineFile.image;

    //TODO: check if image exists
    console.log("Pulling image", image);
    await pull(image);

    return docker.createContainer({
        Image: image,
        Cmd: ["tail", "-f", "/dev/null"],
        WorkingDir: "/opt/atlassian/pipelines/agent/build",
        Env: populateVariables(gitConfig, step, opts, customVariables),
        HostConfig: {
            Binds: [
                `${gitConfig.destination}:/opt/atlassian/pipelines/agent/build/`
            ]
        }
    });
}

async function processStep(opts, pipelineFile, gitConfig, step, customVariables) {
    switch (true) {
        case (step.variables != undefined):

            // TODO: check for no prompt flag
            // https://bitbucket.org/blog/introducing-default-values-for-custom-pipeline-variables
            var answers = [];
            for (let p of step.variables) {
                var prompt = `Custom variable "${p.name}"`;
                if (p.default) {
                    prompt += ` (${p.default})`;
                }
                prompt += ": ";

                var answer = await ask(prompt);
                answers.push([
                    p.name,
                    p.default && !answer ? p.default : answer
                ]);
            }
            return answers;

        case (step.parallel != undefined):
            var allSteps = step.parallel.map((i, index) => {
                i.step.parallel_step = index;
                i.step.parallel_step_count = step.parallel.length;
                return executeStep(opts, gitConfig, pipelineFile, i.step, customVariables);
            });
            var results = await Promise.all(allSteps);
            var stop = results.reduce((i, j) => i || j, false);
            if (stop) {
                throw new Error("Halting due to previous error");
            }
            break;
        case (step.step != undefined):
            stop = await executeStep(opts, gitConfig, pipelineFile, step.step, customVariables);
            if (stop) {
                throw new Error("Halting due to previous error");
            }
            break;
        default:
            break;
    }
}

export async function start(opts) {
    if (!fs.existsSync(opts.source)) {
        console.error(`Source dir '${opts.source}' does not exist`);
        process.exit(-1);
    }

    let gitConfig = await clone(opts.source);
    try {
        console.log("Creating cache folder %s", opts.cache);
        mkdirSync(opts.cache, { recursive: true });

        const pipelineFile = load(readFileSync(opts.file, "utf8"));
        let pipeline = opts.pipeline
            .split(":")
            .reduce((i, j) => {
                return i ? i[j] : null;
            }, pipelineFile.pipelines);

        if (!pipeline) {
            console.error(`Error: Pipeline '${opts.pipeline}' does not exist in your pipeline file.`);
            console.error("The following are available pipelines:");

            let pipelinesStrings = Object.keys(pipelineFile.pipelines).map(i => {
                if (pipelineFile.pipelines[i] instanceof Array) {
                    return i;
                } else {
                    return Object.keys(pipelineFile.pipelines[i]).map(j => {
                        return `${i}:${j}`;
                    });
                }

            }).flat().join("\n\t- ");
            console.error("\t- " + pipelinesStrings);
            process.exit(-1);
        }

        rmSync(opts.artifacts, { force: true });

        var customVariables = [];
        for (let step of pipeline) {
            let returnedVariables = await processStep(opts, pipelineFile, gitConfig, step, customVariables);
            if (returnedVariables)
                customVariables = returnedVariables;
        }

    } catch (e) {
        console.log(e);
        process.exit(1);
    }
}
