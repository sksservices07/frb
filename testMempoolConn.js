require('dotenv').config()
const ethers = require('ethers');
const address = process.env.WSS_BSC_TEST;

const environment = "test"
var wss;
environment === "test" ? wss = process.env.WSS_BSC_TEST : wss = process.env.WSS_BSC_MAIN

const provider = new ethers.providers.WebSocketProvider(wss)
provider.on("pending", async (tx) => {
    console.log(tx);
});