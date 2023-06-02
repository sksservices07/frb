const ethers = require("ethers");
require('dotenv').config()

const environment = "prod"
var wss;
environment === "test" ? wss = process.env.WSS_BSC_TEST : wss = process.env.WSS_BSC_MAIN

var customWsProvider = new ethers.providers.WebSocketProvider(wss);

const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, customWsProvider);
const signer = wallet.connect(customWsProvider)

function firstFunction() {
    return new Promise((resolve, reject) => {
        let y = 0
        setTimeout(() => {
            for (i = 0; i < 10; i++) {
                y++
            }
            console.log('Loop completed.')
            resolve(y)
        }, 2000)
    })
}

const buyToken = async (account, tokenContract, gasLimit, gasPrices) => {
    //buyAmount how much are we going to pay for example 0.1 BNB
    const buyAmount = 0.1

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

    // const receipts = await provider
    //     .waitForTransaction(tx.hash, 1, 150000)
    //     .then(() => {
    //         console.log(`Transaction https://bscscan.com/tx/${tx.hash} mined, status success`);
    //     });


    const receipt = await tx.wait();
    if (receipt && receipt.blockNumber && receipt.status === 1) { // 0 - failed, 1 - success
        console.log(`Transaction https://bscscan.com/tx/${receipt.transactionHash} mined, status success`);
    } else if (receipt && receipt.blockNumber && receipt.status === 0) {
        console.log(`Transaction https://bscscan.com/tx/${receipt.transactionHash} mined, status failed`);
    } else {
        console.log(`Transaction https://bscscan.com/tx/${receipt.transactionHash} not mined`);
    }
}

const test = async () => {
    await buyToken(signer, "0x469eF66c1A7F8FDd999dE6C64ce9AA04419FCABa", 259631, 0.0000168821)
}

test()