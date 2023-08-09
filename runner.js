require('dotenv').config()

const ethers = require('ethers')
const axios = require('axios')
const moment = require('moment')
const router_abi = require('./abi/routerABI.json')
const erc20_abi = require('./abi/erc20.json')

const BUY_AMOUNT = 0.001
const PAN_ROUTER_ADDRESS = process.env.PAN_ROUTER_ADDRESS //contract of pancake router
const BNB_CONTRACT = '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c' //Contract on WBNB coin
const environment = 'prod'
const wss =
  environment === 'test' ? process.env.WSS_BSC_TEST : process.env.WSS_BSC_MAIN
console.log('[WSS]: ', wss)

//function to calculate the gas price
function calculate_gas_price(action, amount) {
  if (action === 'buy') return amount.add(1)
  else return amount.sub(1)
}

// router contract initiator
function router(signerOrProvider) {
  return new ethers.Contract(PAN_ROUTER_ADDRESS, router_abi, signerOrProvider)
}

// erc20 contract initiator
function erc20(tokenAddress, signerOrProvider) {
  return new ethers.Contract(tokenAddress, erc20_abi, signerOrProvider)
}

// get timestamp of token
async function get_token_creation_time(token_address) {
  // let dateString = moment.unix('1644915012').add(1, 'days').format('MM/DD/YYYY')
  console.log('[API]: Loading...')
  const res = await axios.get(
    `https://api.bscscan.com/api?module=account&action=txlist&address=${token_address}&startblock=0&endblock=99999999&page=1&offset=10&sort=asc&apikey=IH25T1JC2I8S6AT4577MAU9VV2P7EE56NZ`
  )
  console.log('[API]: ', res.status)

  const current_time = moment().valueOf()
  const token_creation_time = moment
    .unix(res?.data?.result[0]?.timeStamp)
    .add(1, 'days')
    .valueOf()

  if (current_time > token_creation_time) {
    console.log('[LOG]: passed')
    return true
  }

  return false
}

async function getTokenOutputs(provider, token_address, buyAmount, isBuy) {
  const amountIn = ethers.utils.parseUnits(buyAmount.toString(), 'ether')

  const token_pair = isBuy
    ? [BNB_CONTRACT, token_address]
    : [token_address, BNB_CONTRACT]

  const amounts = await router(provider).getAmountsOut(amountIn, token_pair)
  const output_amount = ethers.utils.formatEther(amounts[1])
  return output_amount
}

async function buyToken(provider, signer, token_address, gasLimit, gasPrices) {
  const buyAmount = BUY_AMOUNT
  const amountIn = ethers.utils.parseUnits(buyAmount.toString(), 'ether')
  const amounts = await router(provider).getAmountsOut(amountIn, [
    BNB_CONTRACT,
    token_address,
  ])
  const amount_token = ethers.utils.formatEther(amounts[1])

  const amountOut1 = Math.round(parseFloat(amount_token) * 0.95).toString()
  const testAmountOutMin = ethers.utils.parseUnits(amountOut1, 'wei')

  let tx
  let result = true
  try {
    // const nonce = await provider.getTransactionCount(PAN_ROUTER_ADDRESS)
    const tx_inner = await router(provider)
      .connect(signer)
      .swapExactETHForTokensSupportingFeeOnTransferTokens(
        testAmountOutMin,
        [BNB_CONTRACT, token_address],
        signer.address,
        Date.now() + 1000 * 60 * 10,
        {
          value: amountIn,
          gasLimit: gasLimit,
          gasPrice: gasPrices,
        }
      )
    tx = await tx_inner.wait()
  } catch (e) {
    result = false
    console.log('[BUY TX ERROR]: ', e)
  }

  console.log(`[BUY DONE]: ${tx?.transactionHash}`)
  return result
}

async function sellToken(
  provider,
  signer,
  tokenAddress,
  gasLimit,
  gasPrice,
  value = 50
) {
  const sellTokenContract = erc20(tokenAddress, signer)
  const tokenBalanceInWei = await sellTokenContract.balanceOf(signer.address)
  const tokenBalance = parseFloat(ethers.utils.formatEther(tokenBalanceInWei))
  const amountIn = ethers.utils.parseUnits(
    ((tokenBalance * value) / 100).toString(),
    'ether'
  )
  const amounts = await router(signer).getAmountsOut(amountIn, [
    tokenAddress,
    BNB_CONTRACT,
  ])
  const amount_token = ethers.utils.formatEther(amounts[1])
  const amountOut1 = Math.round(parseFloat(amount_token) * 0.8).toString()
  const amountOutMin = ethers.utils.parseUnits(amountOut1, 'wei')
  let approve, receipt_approve

  try {
    approve = await sellTokenContract.approve(
      PAN_ROUTER_ADDRESS,
      tokenBalanceInWei
    )
    receipt_approve = await approve.wait()
  } catch (error) {
    console.log('[ERROR]: sell approve, ', error)
    return
  }

  if (
    receipt_approve &&
    receipt_approve.blockNumber &&
    receipt_approve.status === 1
  ) {
    console.log(
      `[SELL APPROVED]: https://bscscan.com/tx/${receipt_approve.transactionHash}`
    )

    try {
      const estimateGasLimit = await router(provider)
        .connect(signer)
        .estimateGas.swapExactTokensForETHSupportingFeeOnTransferTokens(
          amountIn,
          amountOutMin,
          [tokenAddress, BNB_CONTRACT],
          signer.address,
          Date.now() + 1000 * 60 * 10,
          {
            gasLimit: gasLimit,
            gasPrice: gasPrice,
          }
        )
      const gasP = await provider.getGasPrice()
      const tx = await router(provider)
        .connect(signer)
        .swapExactTokensForETHSupportingFeeOnTransferTokens(
          amountIn,
          amountOutMin,
          [tokenAddress, BNB_CONTRACT],
          signer.address,
          Date.now() + 1000 * 60 * 10,
          {
            gasLimit: estimateGasLimit,
            gasPrice: gasP,
          }
        )
      const receipt = await tx.wait()
      console.log('[SELL DONE]: ', receipt?.transactionHash)
    } catch (error) {
      console.log(error)
      console.log('[ERROR]: sell token tx')
    }
  }
}

const init = async function () {
  const customWsProvider = new ethers.providers.WebSocketProvider(wss)
  const customRpcProvider = new ethers.providers.JsonRpcProvider(
    'https://bsc-dataseed.binance.org'
  )

  const rpc_signer = new ethers.Wallet(
    process.env.PRIVATE_KEY,
    customRpcProvider
  )

  const iface = new ethers.utils.Interface([
    'function    swapExactETHForTokens(uint256 amountOutMin, address[] path, address to, uint256 deadline)',
    'function swapETHForExactTokens(uint256 amountOut, address[] path, address to, uint256 deadline)',
    'function swapExactETHForTokensSupportingFeeOnTransferTokens(uint256 amountOutMin,address[] calldata path,address to,uint256 deadline)',
  ])

  // console.log("hi")
  console.log('Block: ', await customWsProvider.getBlockNumber())
  let tokenStack = []

  customWsProvider.on('pending', async (tx) => {
    customWsProvider.getTransaction(tx).then(async function (transaction) {
      // now we will only listen for pending transaction on pancakesswap factory (commented out)
      if (transaction && transaction.to === PAN_ROUTER_ADDRESS) {
        const value = parseFloat(
          ethers.utils.formatEther(transaction.value.toString())
        )
        console.log('...')

        if (value > 0.00001) {
          let result = []
          try {
            result = iface.decodeFunctionData(
              'swapExactETHForTokens',
              transaction.data
            )
          } catch (error) {
            try {
              result = iface.decodeFunctionData(
                'swapExactETHForTokensSupportingFeeOnTransferTokens',
                transaction.data
              )
            } catch (error) {
              try {
                result = iface.decodeFunctionData(
                  'swapETHForExactTokens',
                  transaction.data
                )
              } catch (error) {
                console.log(`Transaction ${transaction} final err : ${error}`)
                console.log('loop for swapExactETHForTokens')
              }
            }
          }
          if (result.length > 0) {
            if (result[1].length > 0) {
              const tokenAddress = result[1][1]

              const buyGasPrice = calculate_gas_price(
                'buy',
                transaction.gasPrice
              )
              const sellGasPrice = calculate_gas_price(
                'sell',
                transaction.gasPrice
              )
              const tokenContract = erc20(tokenAddress, customRpcProvider)
              const tokenDecimalTx = await tokenContract.decimals()
              const tokenDecimal = tokenDecimalTx.toString()

              if (parseInt(tokenDecimal) !== 18) {
                return
              }

              // calculate profit margin
              const buy_output = await getTokenOutputs(
                customRpcProvider,
                tokenAddress,
                BUY_AMOUNT,
                true
              )
              const sell_output = await getTokenOutputs(
                customRpcProvider,
                tokenAddress,
                parseFloat(buy_output),
                false
              )
              
              const buyGasPriceInEth = parseFloat(ethers.utils.formatEther(buyGasPrice))
              const sellGasPriceInEth = parseFloat(ethers.utils.formatEther(sellGasPrice))

              const change_eth = (parseFloat(sell_output) - BUY_AMOUNT) - (buyGasPriceInEth + sellGasPriceInEth)
              const change_eth_percentage = (change_eth / BUY_AMOUNT) * 100

              // console.log(`[${tokenAddress}][BUY]: PROFIT: `, buy_output)
              // console.log(`[${tokenAddress}][SELL]: PROFIT: `, sell_output)
              console.log(`[${tokenAddress}] PROFIT: ${change_eth_percentage}%`)
              if(change_eth_percentage < 2) return;

              let test_result = await get_token_creation_time(tokenAddress)
              if (!test_result) return

              if (tokenStack.length > 0) return

              tokenStack.push(tokenAddress)

              console.log('[BUYING]: ', tokenAddress)
              let res = await buyToken(
                customRpcProvider,
                rpc_signer,
                tokenAddress,
                transaction.gasLimit,
                buyGasPrice
              )

              if (!res) {
                console.log('[NOT SELLING] ', tokenAddress)
                return
              }
              console.log('[SELLING]: ', tokenAddress)
              await sellToken(
                customRpcProvider,
                rpc_signer,
                tokenAddress,
                transaction.gasLimit,
                sellGasPrice
              )

              // cleanup the stack
              tokenStack = tokenStack.filter((token) => token !== tokenAddress)
            }
          }
        }
      }
    })
  })

  customWsProvider.on('error', async (ep) => {
    console.log('ep', ep)
    console.log(`Unable to connect to ${ep.subdomain} retrying in 3s...`)
    setTimeout(init, 3000)
  })
  customWsProvider.on('close', async (code) => {
    console.log(
      `Connection lost with code ${code}! Attempting reconnect in 3s...`
    )
    customWsProvider.terminate()
    setTimeout(init, 3000)
  })
}

init()
