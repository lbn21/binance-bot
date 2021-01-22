require('dotenv').config()
const Binance = require('binance-api-node').default
const moment = require('moment');
const crypto = require('crypto');
const axios = require('axios');

axios.defaults.headers.common['X-MBX-APIKEY'] = process.env.API_KEY // for POST requests

//public client
const client = Binance()
// Authenticated client, can make signed calls
const client2 = Binance({
    apiKey: process.env.API_KEY,
    apiSecret: process.env.API_SECRET
})

const output = [];

//helper functions
function makeSignature(data) {
    return crypto.createHmac('sha256', process.env.API_SECRET).update(data).digest('hex')
}

function addToOutput(action, url, arr, result = true) {
    arr.push({
        Time: moment().format('D/MM/YYYY hh:mm:ss'),
        Action: action,
        Url: url,
        Result: result ? 'PASS' : 'FAIL'
    })
}

async function transferFromPoolToSpot() {
    const functionName = arguments.callee.name;
    const pathPaymentList = '/sapi/v1/mining/payment/list';
    const pathAssetTransfer = '/sapi/v1/asset/transfer';
    let outstandingBalance = 0;
    try {
        const {data: {accountProfits}} = await client2.privateRequest('GET', pathPaymentList, {
            algo: 'ETHASH',
            userName: process.env.POOL_USERNAME,
            startDate: moment().subtract(1, 'days').valueOf()
        });
        outstandingBalance = accountProfits.reduce((bal, val) => {
            let balance = bal;
            if (val['status'] === 2) {
                balance += val['profitAmount']
            }
            return balance
        }, 0)
        addToOutput(functionName, pathPaymentList, output);
    } catch (e) {
        addToOutput(functionName, pathPaymentList, output, false);
    }
    //if outstanding balance is greater than 0 transfer to spot wallet
    if (outstandingBalance > 0) {
        try {
            const transfer = await client2.privateRequest('POST', pathAssetTransfer, {
                type: 'MINING_MAIN',
                asset: 'ETH',
                amount: outstandingBalance.toString()
            })
            addToOutput(functionName, pathAssetTransfer, output);
        } catch (e) {
            addToOutput(functionName, pathAssetTransfer, output, false);
        }
    }
}

async function buyBnb() {
    const functionName = arguments.callee.name;
    const pathOrder = '/api/v3/order';
    try {
        const {balances} = await client2.privateRequest('GET', '/api/v3/account');
        const gbpBalance = Number(balances.find(b => b['asset'] === 'GBP')['free']);
        //if we have GBP let's buy BNB
        if (gbpBalance > 0) {
            const symbol = 'BNBGBP';
            const {symbols} = await client.exchangeInfo()
            const bnbGbpInfo = symbols.find(i => i['symbol'] === symbol)
            const {BNBGBP} = await client.prices({symbol: symbol});
            const precision = Math.round(-Math.log10(bnbGbpInfo['filters'].find(f => f['filterType'] === 'LOT_SIZE')['stepSize']))
            const {tradeFee: [{taker: fee}]} = await client2.privateRequest('GET', '/wapi/v3/tradeFee.html', {
                symbol: symbol
            });
            const qty = Number((gbpBalance / +BNBGBP) * (1 - fee / 100)).toFixed(precision);
            if (qty > 0) {
                const buy = await client2.privateRequest('POST', pathOrder, {
                    symbol: 'BNBGBP',
                    side: 'BUY',
                    type: 'MARKET',
                    quantity: qty,
                    newOrderRespType: 'FULL'
                })
                addToOutput(functionName, pathOrder, output);
            }
        }
    } catch (e) {
        addToOutput(functionName, pathOrder, output, false);
    }
}

async function convertDust() {
    const functionName = arguments.callee.name;
    const pathAssetDust = '/sapi/v1/asset/dust';
    try {
        const params = new URLSearchParams();
        const {balances} = await client2.privateRequest('GET', '/api/v3/account');
        balances
            .filter(x => Number(x['free']) > 0 && x['asset'].indexOf('BNB') === -1)
            .forEach(x => {
                params.append('asset', x['asset']);
            })
        const timestamp = await client.time();
        params.append('timestamp', timestamp);
        const signature = makeSignature(params.toString());
        params.append('signature', signature);
        const url = `${process.env.API_ENDPOINT}${pathAssetDust}?${params.toString()}`
        const convert = await axios.post(url);
        addToOutput(functionName, pathAssetDust, output);
    } catch (e) {
        addToOutput(functionName, pathAssetDust, output, false);
    }
}

//call all functions in order
(async () => {
    await transferFromPoolToSpot();
    await buyBnb();
    await convertDust();
    console.table(output)
})();


