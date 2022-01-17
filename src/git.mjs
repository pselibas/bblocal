import temp from "temp";
import simpleGit from "simple-git";

// auto cleanup of created folders
let tempCleanup = temp.track();
// let tempCleanup = temp;

export async function clone(src) {

    let currentRepo = simpleGit(".", { binary: "git" });

    let branchName = await currentRepo.revparse(["--abbrev-ref", "HEAD"]);
    let commitHash = await currentRepo.revparse(["HEAD"]);

    let destination = tempCleanup.mkdirSync("bb-local");

    console.log("Cloning '%s' to '%s'", src, destination);
    let destinationRepo = simpleGit();
    await destinationRepo.clone(src, destination);

    console.log("Checking out '%s'", commitHash);
    await destinationRepo.checkout(commitHash);
    
    return {
        commitHash,
        branchName,
        destination
    };
}
