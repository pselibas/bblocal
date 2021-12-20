#!/usr/bin/env node
import { Command } from "commander";
import { readFile } from "fs/promises";
import { start } from "./src/bblocal.mjs";

let version = JSON.parse(
    await readFile(
        new URL("./package.json", import.meta.url)
    )
).version;

let program = new Command();

program
    .version(version)
    .description("An application for running bitbucket pipeline files locally. This tool is intended to help debug and create pipeline files.")
    .option("-f, --file <file>", "bitbucket pipeline file", "bitbucket-pipelines.yml")
    .option("-p, --pipeline <pipeline>", "Specify which pipeline to execute", "default")
    .option("-s, --source <source folder>", "Specify the source folder", "./")
    .option("-a, --artifacts <target artifact tar>", "Location of artifacts tar file", "./.bblocal/artifacts.tar")
    .option("-c, --cache <cache folder>", "Folder to store cache for this build", "./.bblocal/cache")
    .option("-e, --env <items>", "comma separated list of variables. (eg \"VAR1=val1,VAR2=val2\")", (v) => v.split(","), []);

program.parse();
const options = program.opts();
start(options);
