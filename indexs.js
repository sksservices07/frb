require("dotenv").config();
const Big = require("big.js");
const express = require("express");
const bodyParser = require("body-parser");
const http = require("http");
const Web3 = require("web3");
const BigNumber = require("bignumber.js");
const HDWalletProvider = require("@truffle/hdwallet-provider");
const moment = require("moment-timezone");
const numeral = require("numeral");
const _ = require("lodash");
const axios = require("axios");
const factoryABI = require("./abi/uniswapABI.json");
const kyberABI = require("./abi/kyberAbi.json");
const SushiABI = require("./abi/sushiABI.json");
const uniPairABI = require("./abi/uniswap_pairABI.json");
const erc20ABI = require("./abi/erc20.json");
const routerABI = require("./abi/routerABI.json")
const { ethers } = require("ethers");
const { profile } = require("console");
const { getPoolImmutables, getPoolState } = require('./helpers');
const { sign } = require("crypto");

require('dotenv').config()

// SERVER CONFIG
const PORT = process.env.PORT || 5002;
const app = express();
const server = http
  .createServer(app)
  .listen(PORT, () => console.log(`Listening on ${PORT}`));

// WEB3 CONFIG
const web3 = new Web3(
  new HDWalletProvider(process.env.PRIVATE_KEY, process.env.RPC_URL)
);


const myjSOnRCPProvider = new ethers.providers.JsonRpcProvider(process.env.RPC_URL);
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, myjSOnRCPProvider);
const signer = wallet.connect(myjSOnRCPProvider);


async function getPrices() {
  console.log("hi")
  const Buy_FACTORY_ABI = factoryABI;
  const Buy_FACTORY_ADDRESS = process.env.Buy_FACTORY_ADDRESS; //BiSwap
  const BuyFactoryContract = new web3.eth.Contract(
    Buy_FACTORY_ABI,
    Buy_FACTORY_ADDRESS
  );
  const routerContractBuy = new web3.eth.Contract(routerABI, process.env.Buy_Router_Address_V2)
  const routerContractSell = new web3.eth.Contract(routerABI, process.env.Sell_Router_Address_V2)

  const allPairsLength = await BuyFactoryContract.methods
    .allPairsLength()
    .call(); //3052
  for (let i = 0; i < allPairsLength; i++) {
    //console.log(i)
    const pairAddress = await BuyFactoryContract.methods.allPairs(i).call();
    const pairContract = new web3.eth.Contract(uniPairABI, pairAddress);
    const token0 = await pairContract.methods.token0().call();
    if (token0 === process.env.Token0)//checking if it is USDT or not
    {
      const token0Contract = new web3.eth.Contract(erc20ABI, token0);
      const token0Name = await token0Contract.methods.symbol().call();

      const token0Decimal = await token0Contract.methods.decimals().call();
      const token1 = await pairContract.methods.token1().call();

      const token1Contract = new web3.eth.Contract(erc20ABI, token1);
      const token1Name = await token1Contract.methods.symbol().call();
      const token1Decimal = await token1Contract.methods.decimals().call();
      const invest = 1
      const amountIn = ethers.utils.parseUnits(
        invest.toString(),
        token0Decimal
      )
      console.log(ethers.utils.formatEther(amountIn))
      var initValRetFirst
      try {
        initValRetFirst = ethers.utils.formatUnits((await routerContractBuy.methods.getAmountsOut(amountIn, [token0, token1]).call())[1], token1Decimal)
      } catch (e) {
        initValRetFirst = 0

      }
      const initValRet = ethers.utils.parseUnits(
        initValRetFirst.toString(),
        token1Decimal
      )
      var returnToInit

      try {
        returnToInit = ethers.utils.formatUnits((await routerContractSell.methods.getAmountsOut(initValRet, [token1, token0]).call())[1], token0Decimal)
      } catch (e) {
        returnToInit = 0
      }

      const profitRate =
        returnToInit === 0 ? 0 : ((returnToInit - invest) * 100) / invest;


      console.table([
        {
          "index": i,
          Pair: `${token0Name}/${token1Name}`,
          "Invest": invest,
          "PurchaseAt": "apeswap",
          "Output": initValRetFirst,
          "Saleat": "pancake",
          "Return": returnToInit,
          "prof%": profitRate.toFixed(3),
          "Arbitrage": profitRate > 0 ? "Possible" : "No"
        },
      ]);

      // if (profitRate > 0) {
      //   /******** Do the actual Trade Start ************** */
      //   const amountIn = ethers.utils.parseUnits(
      //     invest.toString(),
      //     token0Decimal
      //   )
      //   const approvalAmountToken0 = (amountIn * 1000000).toString()
      //   const approvalAmountToken1 = (priceOf1Token0withToken1 * 1000000).toString()
      //   const approvalResponseToken0 = await token0Contract.methods.connect(signer).approve(process.env.Buy_Router_Address_V2, approvalAmountToken0).call()
      //   const approvalResponseToken1 = await token1Contract.methods.connect(signer).approve(process.env.Sell_Router_Address_V2, approvalAmountToken1).call()

      //   const transaction = await routerContractBuy.methods.connect(signer).swapTokensForExactTokens(
      //     amountIn, //amountIn
      //     0, //amountOutMin
      //     [token0, token1], //addresses
      //     process.env.PUBLIC_KEY, //to
      //     Math.floor(Date.now() / 1000) + (60 * 10), //deadline
      //     {
      //       gasLimit: ethers.utils.hexlify(1000000)
      //     }).call()

      //   const receipt = await provider
      //     .waitForTransaction(transaction.hash, 1, 150000)
      //     .then(() => {

      //       await routerContractSell.methods.connect(signer).swapTokensForExactTokens(
      //         priceOf1Token0withToken1,
      //         0,
      //         [token1, token0],
      //         process.env.PUBLIC_KEY,
      //         Math.floor(Date.now() / 1000) + (60 * 10),
      //         {
      //           gasLimit: ethers.utils.hexlify(1000000)
      //         }).call()

      //     })
      //   /**************************** Do the Actual Trade End***************** */
      // }

    }
  }

}
//getPrices()
// Check markets every n seconds
const POLLING_INTERVAL = process.env.POLLING_INTERVAL || 5000; // 5 Seconds
priceMonitor = setInterval(async () => {
  await getPrices();
}, POLLING_INTERVAL);
