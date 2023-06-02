const express = require("express");
const swapABI = require("./abi/swapAbi.json");
const aBI = require("./abi/routerAbi.json");
const http = require('http');
const Web3 = require("web3")
const ethers = require("ethers");
const panabi = require("./panabi.json")
const app = express();
require('dotenv').config()
const PORT = process.env.PORT;

const environment = "prod"
var wss;
environment === "test" ? wss = process.env.WSS_BSC_TEST : wss = process.env.WSS_BSC_MAIN
console.log("wss:", wss)

const web3 = new Web3(wss)

const PAN_ROUTER_ADDRESS = process.env.PAN_ROUTER_ADDRESS; //contract of pancake router
const BNB_CONTRACT = "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c" //Contract on WBNB coin
//const BNB_CONTRACT = "0x418D75f65a02b3D53B2418FB8E1fe493759c7605" //Contract on WBNB coin
const swapAbi = swapABI
const abi = aBI

//function to calculate the gas price
function calculate_gas_price(action, amount) {
    if (action === "buy") {
        return ethers.utils.formatUnits(amount.add(1), 'gwei')
    } else {
        return ethers.utils.formatUnits(amount.sub(1), 'gwei')
    }
}
//We are using pancakeswap router to buy/sell
function router(account) {
    return new ethers.Contract(
        PAN_ROUTER_ADDRESS,
        // [
        //     'function getAmountsOut(uint amountIn, address[] memory path) public view returns (uint[] memory amounts)',
        //     'function swapExactTokensForTokens(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)',
        //     'function swapExactTokensForTokensSupportingFeeOnTransferTokens(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)',
        //     'function swapExactETHForTokensSupportingFeeOnTransferTokens(uint amountOutMin, address[] calldata path, address to, uint deadline) external payable',
        //     'function swapExactTokensForETH (uint amountOutMin, address[] calldata path, address to, uint deadline) external payable'
        // ],
        abi,
        account
    );
}
function erc20(account, tokenAddress) {
    return new ethers.Contract(
        tokenAddress,
        [{
            "constant": true,
            "inputs": [{ "name": "_owner", "type": "address" }],
            "name": "balanceOf",
            "outputs": [{ "name": "balance", "type": "uint256" }],
            "payable": false,
            "type": "function"
        },
        { "inputs": [], "name": "decimals", "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }], "stateMutability": "view", "type": "function" },
        { "inputs": [], "name": "symbol", "outputs": [{ "internalType": "string", "name": "", "type": "string" }], "stateMutability": "view", "type": "function" },
        {
            "constant": false,
            "inputs": [{ "name": "_spender", "type": "address" }, { "name": "_value", "type": "uint256" }],
            "name": "approve",
            "outputs": [{ "name": "", "type": "bool" }],
            "payable": false,
            "stateMutability": "nonpayable",
            "type": "function"
        },
        ],
        account
    );
}
const buyToken = async (provider, account, tokenContract, gasLimit, gasPrices) => {
    //buyAmount how much are we going to pay for example 0.1 BNB
    const buyAmount = 0.2

    /*Slippage refers to the difference between the expected price 
    of a trade and the price at which the trade is executed */
    const slippage = 0

    //amountOutMin: How many token we are going to receive
    let amountOutMin = 0;
    const amountIn = ethers.utils.parseUnits(buyAmount.toString(), 'ether');
    const gasPrice = ethers.utils.parseUnits(gasPrices.toString(), 'ether');

    var amounts;
    // if (parseInt(slippage) !== 0) {

    amounts = await router(account).getAmountsOut(amountIn, [BNB_CONTRACT, tokenContract]);
    console.log(`amounts: ${amounts}`)
    amountOutMin = amounts[1].sub(amounts[1].div(100).mul(`${slippage}`));
    console.log(`amountOutMin: ${amountOutMin}`)
    console.log(`amountIn: ${amountIn}`)
    console.log(`gasLimit: ${gasLimit}`)
    console.log(`gasPrice: ${gasPrice}`)
    //}
    try {
        console.log(`Tx Starts`)
        const tx = await router(account).swapExactETHForTokensSupportingFeeOnTransferTokens(

            amountOutMin,
            [BNB_CONTRACT, tokenContract],
            account.address,
            (Date.now() + 1000 * 60 * 10),
            {
                'value': amountIn,
                'gasLimit': gasLimit,
                'gasPrice': gasPrice,
            }
        );
        console.log(`outPuttx: ${tx}`)

    } catch (e) {
        console.log("txError", e)
    }
    console.log(`outPuttx1: ${tx}`)
    const receipts = await provider
        .waitForTransaction(tx.hash, 1, 150000)
        .then(() => {
            console.log(`Transaction https://bscscan.com/tx/${tx.hash} mined, status success`);
        });


    const receipt = await tx.wait();
    if (receipt && receipt.blockNumber && receipt.status === 1) { // 0 - failed, 1 - success
        console.log(`Transaction https://bscscan.com/tx/${receipt.transactionHash} mined, status success`);
    } else if (receipt && receipt.blockNumber && receipt.status === 0) {
        console.log(`Transaction https://bscscan.com/tx/${receipt.transactionHash} mined, status failed`);
    } else {
        console.log(`Transaction https://bscscan.com/tx/${receipt.transactionHash} not mined`);
    }
}
const sellToken = async (customWsProvider, account, tokenContract, gasLimit, gasPrice, value = 99) => {
    const sellTokenContract = new ethers.Contract(tokenContract, swapAbi, account)
    const contract = new ethers.Contract(PAN_ROUTER_ADDRESS, abi, account)
    const accountAddress = account.address
    const tokenBalance = await erc20(account, tokenContract).balanceOf(accountAddress);
    let amountOutMin = 0;
    const amountIn = tokenBalance.mul(value).div(100)
    const amounts = await router(account).getAmountsOut(amountIn, [tokenContract, BNB_CONTRACT]);
    if (parseInt(slippage) !== 0) {
        amountOutMin = amounts[1].sub(amounts[1].mul(`${slippage}`).div(100));
    } else {
        amountOutMin = amounts[1]
    }
    const approve = await sellTokenContract.approve(PAN_ROUTER_ADDRESS, amountIn)
    const receipt_approve = await approve.wait();
    if (receipt_approve && receipt_approve.blockNumber && receipt_approve.status === 1) {
        console.log(`Approved https://bscscan.com/tx/${receipt_approve.transactionHash}`);
        const swap_txn = await contract.swapExactTokensForETHSupportingFeeOnTransferTokens(
            amountIn, amountOutMin,
            [tokenContract, BNB_CONTRACT],
            accountAddress,
            (Date.now() + 1000 * 60 * 10),
            {
                'gasLimit': gasLimit,
                'gasPrice': gasPrice,
            }
        )
        const receipt = await swap_txn.wait();
        if (receipt && receipt.blockNumber && receipt.status === 1) { // 0 - failed, 1 - success
            console.log(`Transaction https://bscscan.com/tx/${receipt.transactionHash} mined, status success`);
        } else if (receipt && receipt.blockNumber && receipt.status === 0) {
            console.log(`Transaction https://bscscan.com/tx/${receipt.transactionHash} mined, status failed`);
        } else {
            console.log(`Transaction https://bscscan.com/tx/${receipt.transactionHash} not mined`);
        }
    }
}

var init = async function () {

    var customWsProvider = new ethers.providers.WebSocketProvider(wss);

    //const url = process.env.RPC_URL
    //const customWsProvider = new ethers.providers.JsonRpcProvider(wss);
    const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, customWsProvider);
    const signer = wallet.connect(customWsProvider)
    console.log("signer", signer)

    const iface = new ethers.utils.Interface(['function    swapExactETHForTokens(uint256 amountOutMin, address[] path, address to, uint256 deadline)',
        'function swapETHForExactTokens(uint256 amountOut, address[] path, address to, uint256 deadline)',
        'function swapExactETHForTokensSupportingFeeOnTransferTokens(uint256 amountOutMin,address[] calldata path,address to,uint256 deadline)'])
    console.log("hi")

    customWsProvider.on("pending", async (tx) => {
        customWsProvider.getTransaction(tx).then(async function (transaction) {
            // now we will only listen for pending transaction on pancakesswap factory (commented out)
            if (transaction
                && transaction.to === PAN_ROUTER_ADDRESS
            ) {

                const value = web3.utils.fromWei(transaction.value.toString())
                const gasPrice = web3.utils.fromWei(transaction.gasPrice.toString())
                const gasLimit = web3.utils.fromWei(transaction.gasLimit.toString())
                console.log(`Transaction:${transaction.hash} Worth: ${value}`)
                // for example we will be only showing transaction that are higher than 30 bnb
                if (value > 100) {
                    console.log("value : ", value);
                    console.log("gasPrice : ", gasPrice);
                    console.log("gasLimit : ", gasLimit);
                    //we can print the sender of that transaction
                    console.log("from", transaction.from);
                    let result = []
                    //we will use try and catch to handle the error and decode the data of the function used to swap the token
                    try {

                        result = iface.decodeFunctionData('swapExactETHForTokens', transaction.data)
                        console.log("loop for swapExactETHForTokens")
                    } catch (error) {
                        try {
                            result = iface.decodeFunctionData('swapExactETHForTokensSupportingFeeOnTransferTokens', transaction.data)
                            console.log("loop for swapExactETHForTokens")
                        } catch (error) {
                            try {
                                result = iface.decodeFunctionData('swapETHForExactTokens', transaction.data)
                                console.log("loop for swapExactETHForTokens")
                            } catch (error) {
                                console.log(`Transaction ${transaction} final err : ${error}`);
                                console.log("loop for swapExactETHForTokens")
                            }
                        }
                    }
                    if (result.length > 0) {
                        console.log(`Result is ${result}`)
                        let tokenAddress = ""
                        if (result[1].length > 0) {
                            tokenAddress = result[1][1]
                            console.log(`tokenAddress is ${tokenAddress}`)
                            console.log("tokenAddress", tokenAddress);
                            const buyGasPrice = calculate_gas_price("buy", transaction.gasPrice)
                            const sellGasPrice = calculate_gas_price("sell", transaction.gasPrice)
                            // after calculating the gas price we buy the token
                            console.log("going to buy");
                            await buyToken(customWsProvider, signer, tokenAddress, transaction.gasLimit, buyGasPrice)
                            // after buying the token we sell it 
                            console.log("going to sell the token");
                            await sellToken(customWsProvider, signer, tokenAddress, transaction.gasLimit, sellGasPrice)
                        }
                    }
                }
            }
        });
    });

    customWsProvider.on("error", async (ep) => {
        console.log("ep", ep)
        console.log(`Unable to connect to ${ep.subdomain} retrying in 3s...`);
        setTimeout(init, 3000);
    });
    customWsProvider.on("close", async (code) => {
        console.log(
            `Connection lost with code ${code}! Attempting reconnect in 3s...`
        );
        customWsProvider.terminate();
        setTimeout(init, 3000);
    });
};

init()
//now we create the express server
const server = http.createServer(app);
// we launch the server
server.listen(PORT, () => {
    console.log(`Listening on port ${PORT}`)
});

// var customWsProvider = new ethers.providers.WebSocketProvider(wss);
// const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, customWsProvider);
// const signer = wallet.connect(customWsProvider)

// customWsProvider.on("pending", async (tx) => {
//     console.log(tx);
// });