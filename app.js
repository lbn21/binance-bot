require('dotenv').config()
const Binance = require('binance-api-node').default
const moment = require('moment');
const crypto = require('crypto');
const axios = require('axios');

axios.defaults.headers.common['X-MBX-APIKEY'] = process.env.API_KEY // for POST requests

const makeSignature = (data) => {
    return crypto.createHmac('sha256', process.env.API_SECRET).update(data).digest('hex')
}

//public client
const client = Binance()
// Authenticated client, can make signed calls
const client2 = Binance({
    apiKey: process.env.API_KEY,
    apiSecret: process.env.API_SECRET
})

const transferFromPoolToSpot = async () => {
    let outstandingBalance = 0;
    try {
        const {data: {accountProfits}} = await client2.privateRequest('GET', '/sapi/v1/mining/payment/list', {
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
    } catch (e) {
        console.log(e)
    }
    //if outstanding balance is greater than 0 transfer to spot wallet
    if (outstandingBalance > 0) {
        try {
            const transfer = await client2.privateRequest('POST', '/sapi/v1/asset/transfer', {
                type: 'MINING_MAIN',
                asset: 'ETH',
                amount: outstandingBalance.toString()
            })
            console.log(transfer)
        } catch (e) {
            console.log(e)
        }
    }
}

const buyBnb = async () => {
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
                const buy = await client2.privateRequest('POST', '/api/v3/order', {
                    symbol: 'BNBGBP',
                    side: 'BUY',
                    type: 'MARKET',
                    quantity: qty,
                    newOrderRespType: 'FULL'
                })
                console.log(buy)
            }
        }
    } catch (e) {
        console.log(e);
    }
}

const convertDust = async () => {
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
        const url = `${process.env.API_ENDPOINT}/sapi/v1/asset/dust?${params.toString()}`
        const convert = await axios.post(url);
        console.log(convert.data);
    } catch (e) {
        console.log(e.response.data)
    }
}

//call all functions in order
(async () => {
    await transferFromPoolToSpot();
    await buyBnb();
    await convertDust();
})();


