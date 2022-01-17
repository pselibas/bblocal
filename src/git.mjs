import temp from "temp";
import simpleGit from "simple-git";

// auto cleanup of created folders
let tempCleanup = temp.track();
// let tempCleanup = temp;

export async function clone(src) {

    let currentRepo = new simpleGit(src);

    let branchName = await currentRepo.revparse(["--abbrev-ref", "HEAD"]);
    let commitHash = await currentRepo.revparse(["HEAD"]);

    let destination = tempCleanup.mkdirSync("bb-local");

    console.log("Cloning '%s' to '%s'", src, destination);
    let destinationRepoClone = new simpleGit({ baseDir: destination });
    await destinationRepoClone.clone(src, destination);

    console.log("Checking out '%s'", commitHash);
    let destinationRepo = new simpleGit(destination);
    await destinationRepo.checkout(commitHash);

    return {
        commitHash,
        branchName,
        destination
    };
}
