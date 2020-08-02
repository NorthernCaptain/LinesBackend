const { spawn } = require("child_process");

let httpServers = [];

const githubPushEvent = async (req, res) => {
    console.log("Got github push event", req.body);

    const ls = spawn("/home/leo/bin/autoupdate.sh", []);

    ls.stdout.on("data", data => {
        console.log(`1 autoupdate: ${data}`);
    });

    ls.stderr.on("data", data => {
        console.log(`2 autoupdate: ${data}`);
    });

    ls.on('error', (error) => {
        console.log(`error autoupdate: ${error.message}`);
    });

    ls.on("close", code => {
        console.log(`autoupdate child process exited with code ${code}`);
        console.log(`Closing ${httpServers.length} active servers`);
        for(let srv of httpServers) {
            srv.close()
        }
    });

    res.json({ success: true});
};

const setServers = (servers) => {
    console.log(`Registered ${servers.length} active servers`);
    httpServers = servers;
};

exports.githubPushEvent = githubPushEvent;
exports.setServers = setServers;