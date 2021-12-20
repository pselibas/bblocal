// reference https://support.atlassian.com/bitbucket-cloud/docs/variables-and-secrets/
// TODO: add secure support for SECRET variables

export function populateVariables(gitConfig, step, opts, customVariables) {

    /*
CI - Default value is true. Gets set whenever a pipeline runs.
BITBUCKET_BUILD_NUMBER - The unique identifier for a build. It increments with each build and can be used to create unique artifact names.
BITBUCKET_CLONE_DIR- The absolute path of the directory that the repository is cloned into within the Docker container.
BITBUCKET_COMMIT - The commit hash of a commit that kicked off the build.
BITBUCKET_WORKSPACE -The name of the workspace in which the repository lives.
BITBUCKET_REPO_SLUG - The URL-friendly version of a repository name. For more information, see What is a slug?.
BITBUCKET_REPO_UUID - The UUID of the repository.
BITBUCKET_REPO_FULL_NAME - The full name of the repository (everything that comes after http://bitbucket.org/).
BITBUCKET_BRANCH - The source branch. This value is only available on branches. Not available for builds against tags, or custom pipelines.
BITBUCKET_TAG - The tag of a commit that kicked off the build. This value is only available on tags. Not available for builds against branches.
BITBUCKET_BOOKMARK - For use with Mercurial projects.
BITBUCKET_PARALLEL_STEP - Zero-based index of the current step in the group, for example: 0, 1, 2, …Not available outside a parallel step.
BITBUCKET_PARALLEL_STEP_COUNT - Total number of steps in the group, for example: 5. Not available outside a parallel step.
BITBUCKET_PR_ID - The pull request ID Only available on a pull request triggered build.
BITBUCKET_PR_DESTINATION_BRANCH - The pull request destination branch (used in combination with BITBUCKET_BRANCH). Only available on a pull request triggered build.
BITBUCKET_GIT_HTTP_ORIGIN - The URL for the origin, for example: http://bitbucket.org/<account>/<repo>
BITBUCKET_GIT_SSH_ORIGIN - Your SSH origin, for example: git@bitbucket.org:/<account>/<repo>.git
BITBUCKET_EXIT_CODE - The exit code of a step, can be used in after-script sections. Values can be 0 (success) or 1 (failed)

BITBUCKET_STEP_UUID - The UUID of the step.
BITBUCKET_PIPELINE_UUID - The UUID of the pipeline.
BITBUCKET_DEPLOYMENT_ENVIRONMENT - The URL friendly version of the environment name.
BITBUCKET_DEPLOYMENT_ENVIRONMENT_UUID - The UUID of the environment to access environments via the REST API.
BITBUCKET_PROJECT_KEY - The key of the project the current pipeline belongs to.
BITBUCKET_PROJECT_UUID - The UUID of the project the current pipeline belongs to.
BITBUCKET_STEP_TRIGGERER_UUID - The person who kicked off the build ( by doing a push, merge etc), and for scheduled builds, the uuid of the pipelines user.
BITBUCKET_STEP_OIDC_TOKEN - The 'ID Token' generated by the Bitbucket OIDC provider that identifies the step. This token can be used to access resource servers, such as AWS and GCP without using credentials.
    */

    var variables = {
        "CI": true,
        "BITBUCKET_COMMIT": gitConfig.commitHash,
        "BITBUCKET_CLONE_DIR": "/opt/atlassian/pipelines/agent/build",
        "BITBUCKET_BRANCH": gitConfig.branchName,
        "BITBUCKET_BUILD_NUMBER": "1",
        "BUILD_DIR": "/opt/atlassian/pipelines/agent/build",
        "BITBUCKET_PARALLEL_STEP": step.parallel_step,
        "BITBUCKET_PARALLEL_STEP_COUNT": step.parallel_step_count,
    };

    opts.env
        .map(v => v.split("="))
        .forEach(element => {
            variables[element[0]] = element[1];
        });


    customVariables.forEach(element => {
        variables[element[0]] = element[1];
    });

    return Object.keys(variables)
        .map((key) => {
            return `${key}=${variables[key] !== undefined ? variables[key] : ""}`;
        });

}