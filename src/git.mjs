import Git from "nodegit";
import temp from "temp";

// auto cleanup of created folders
// let tempCleanup = temp.track();
let tempCleanup = temp;

export async function clone(src) {
    let currentRepo = await Git.Repository.open(".");
    let branchName = (await currentRepo.getCurrentBranch()).shorthand();
    let commitHash = (await currentRepo.getHeadCommit()).sha();

    let destination = tempCleanup.mkdirSync("bb-local");

    console.log("Cloning '%s' to '%s'", src, destination);
    let destinationRepo = await Git.Clone(src, destination);

    console.log("Checking out '%s'", commitHash);
    await Git.Checkout.tree(destinationRepo, commitHash);

    return {
        commitHash,
        branchName,
        destination
    };
}
