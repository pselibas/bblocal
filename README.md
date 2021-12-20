# Run Bitbucket Pipeline Locally
It can be a slow process when developing a bitbucket-pipeline.xml file.
The intention of this tool is to run a bitbucket-pipeline.xml file locally in order to speed up the development process.

---
**WARNING**

Do not use this tool to generate and build your software that you plan to use in production.

This project is still a work in progress and still incomplete.

---

## Install

Install `bblocal` with `npm`:

```bash
$ npm install -g bblocal
```

## Usage

```
    Usage: bblocal [options]

    An application for running bitbucket pipeline files locally. This tool is intended to help debug and create pipeline files.

    Options:
    -V, --version                          output the version number
    -f, --file <file>                      bitbucket pipeline file (default: "bitbucket-pipelines.yml")
    -p, --pipeline <pipeline>              Specify which pipeline to execute (default: "default")
    -s, --source <source folder>           Specify the source folder (default: "./")
    -a, --artifacts <target artifact tar>  Location of artifacts tar file (default: "./.bblocal/artifacts.tar")
    -c, --cache <cache folder>             Folder to store cache for this build (default: "./.bblocal/cache")
    -e, --env <items>                      comma separated list of variables. (eg "VAR1=val1,VAR2=val2") (default: [])
    -h, --help                             display help for command

```

## How this works
Coming soon.

## Acknowledgements 
- Inspiration for this project was take from [this project](https://github.com/mserranom/bbrun)
