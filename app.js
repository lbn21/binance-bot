require("dotenv").config();
const Binance = require("binance-api-node").default;
const moment = require("moment");
const axios = require("axios");

axios.defaults.headers.common["X-MBX-APIKEY"] = process.env.API_KEY; // for POST requests

// Authenticated client, can make signed calls
const client2 = Binance({
  apiKey: process.env.API_KEY,
  apiSecret: process.env.API_SECRET,
});

const output = [];

function addToOutput(action, url, arr, result = true) {
  arr.push({
    Time: moment().format("D/MM/YYYY hh:mm:ss"),
    Action: action,
    Url: url,
    Result: result ? "PASS" : "FAIL",
  });
}

async function newOrder(base, quote, qty, side, type, test = false) {
  const action = `${side} ${base}/${quote}`;
  const pathOrder = test ? "/api/v3/order/test" : "/api/v3/order";
  try {
    const { balances } = await client2.privateRequest("GET", "/api/v3/account");
    const quoteBalance = Number(
      balances.find((b) => b["asset"] === quote)["free"]
    );

    if (quoteBalance >= qty) {
      const buy = await client2.privateRequest("POST", pathOrder, {
        symbol: `${base}${quote}`,
        side: side,
        type: type,
        quoteOrderQty: qty,
      });
      addToOutput(action, pathOrder, output);
    }
  } catch (e) {
    console.log(e);
    addToOutput(action, pathOrder, output, false);
  }
}

//call all functions in order
(async () => {
  const BASE = "XVG";
  const QUOTE = "BUSD";
  const QTY = 12;
  const SIDE = "BUY";
  const TYPE = "MARKET";
  await newOrder(BASE, QUOTE, QTY, SIDE, TYPE, true);
  console.table(output);
})();
