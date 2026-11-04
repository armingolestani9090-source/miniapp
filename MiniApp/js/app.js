"use strict";

/* ==========================================
تنظیمات اصلی
========================================== */

const INITIAL_BALANCE = 100000000;

const MARKET_API = "https://apiv2.nobitex.ir";

const UI_REFRESH_MS = 1000;

const MARKET_REFRESH_MS = 15000;

const CANDLE_HISTORY_SECONDS = 86400;

const BUY_FEE = 0.003;

const SELL_FEE = 0.0035;

const STORAGE_KEY = "baletrade_demo_v3";

/* ==========================================
اطلاعات ارزها
========================================== */

const coins = [

{  
    symbol: "BTC",  
    name: "بیت‌کوین",  
    logo: "₿",  
    price: 0,  
    change: 0,  
    marketSymbol: "BTCIRT"  
},  

{  
    symbol: "ETH",  
    name: "اتریوم",  
    logo: "Ξ",  
    price: 0,  
    change: 0,  
    marketSymbol: "ETHIRT"  
},  

{  
    symbol: "SOL",  
    name: "سولانا",  
    logo: "◎",  
    price: 0,  
    change: 0,  
    marketSymbol: "SOLIRT"  
},  

{  
    symbol: "DOGE",  
    name: "دوج‌کوین",  
    logo: "Ð",  
    price: 0,  
    change: 0,  
    marketSymbol: "DOGEIRT"  
},  

{  
    symbol: "XRP",  
    name: "ریپل",  
    logo: "X",  
    price: 0,  
    change: 0,  
    marketSymbol: "XRPIRT"  
}

];

/* ==========================================
وضعیت برنامه
========================================== */

let selectedCoin = "BTC";

let tradeType = "buy";

let selectedChartPeriod = "5";

let quoteCurrency = "IRT";

let chart = null;

let candleSeries = null;

let candleData = [];

let marketConnected = false;

let marketLoading = false;

let candleLoading = false;

let lastMarketUpdate = 0;

let marketTimer = null;

let uiTimer = null;

let chartResizeObserver = null;

let state = loadState();

/* ==========================================
ابزارهای عمومی
========================================== */

function formatNumber(value, decimals = 0) {

const number = Number(value);  

if (!Number.isFinite(number)) {  
    return "۰";  
}  

return number.toLocaleString("fa-IR", {  

    maximumFractionDigits: decimals,  

    minimumFractionDigits: 0  

});

}

function formatMoney(value) {

return formatNumber(value) + " تومان";

}

function getCoin(symbol) {

return coins.find(  
    coin => coin.symbol === symbol  
);

}

function getHolding(symbol) {

const holding = state.holdings[symbol];  

if (!holding) {  

    return {  
        amount: 0,  
        cost: 0  
    };  

}  

return holding;

}

function getTotalCoinValue() {

return coins.reduce((total, coin) => {  

    return total +  
        getHolding(coin.symbol).amount * coin.price;  

}, 0);

}

function getTotalBalance() {

return state.cash + getTotalCoinValue();

}

function getTotalCost() {

return Object.values(state.holdings).reduce(  
    (total, holding) => {  

        return total + holding.cost;  

    },  
    0  
);

}

function getUnrealizedPnl() {

return getTotalCoinValue() - getTotalCost();

}

function showToast(message) {

const toast = document.getElementById("toast");  

if (!toast) return;  


toast.textContent = message;  

toast.classList.add("show");  


clearTimeout(showToast.timer);  


showToast.timer = setTimeout(() => {  

    toast.classList.remove("show");  

}, 2800);

}

function getCurrentTime() {

return new Date().toLocaleTimeString(  
    "fa-IR",  
    {  
        hour: "2-digit",  
        minute: "2-digit",  
        second: "2-digit"  
    }  
);

}

function getQuotePrice(coin) {

if (!coin) return 0;  

if (quoteCurrency === "IRT") {  

    return coin.price;  

}  

const usdt = getCoin("USDT");  

if (!usdt || usdt.price <= 0) {  

    return 0;  

}  

return coin.price / usdt.price;

}

/* ==========================================
ذخیره اطلاعات
========================================== */

function createDefaultState() {

return {  

    cash: INITIAL_BALANCE,  

    holdings: {},  

    history: [],  

    createdAt: Date.now(),  

    updatedAt: Date.now()  

};

}

function loadState() {

try {  

    const saved = localStorage.getItem(STORAGE_KEY);  

    if (!saved) {  

        return createDefaultState();  

    }  


    const data = JSON.parse(saved);  


    if (  
        !data ||  
        typeof data !== "object" ||  
        !Number.isFinite(data.cash) ||  
        data.cash < 0 ||  
        !data.holdings ||  
        typeof data.holdings !== "object"  
    ) {  

        throw new Error("Invalid saved state");  

    }  


    const holdings = {};  


    for (const coin of coins) {  

        const item = data.holdings[coin.symbol];  

        if (!item) continue;  


        const amount = Number(item.amount);  

        const cost = Number(item.cost);  


        if (  
            Number.isFinite(amount) &&  
            Number.isFinite(cost) &&  
            amount >= 0 &&  
            cost >= 0  
        ) {  

            holdings[coin.symbol] = {  

                amount,  

                cost  

            };  

        }  

    }  


    const history = Array.isArray(data.history)  

        ? data.history.slice(0, 100)  

        : [];  


    return {  

        cash: data.cash,  

        holdings,  

        history,  

        createdAt: data.createdAt || Date.now(),  

        updatedAt: data.updatedAt || Date.now()  

    };  


} catch (error) {  

    console.error("Load state error:", error);  

    return createDefaultState();  

}

}

function saveState() {

try {  

    state.updatedAt = Date.now();  


    localStorage.setItem(  

        STORAGE_KEY,  

        JSON.stringify(state)  

    );  

    return true;  


} catch (error) {  

    console.error("Save state error:", error);  

    showToast("ذخیره اطلاعات ناموفق بود");  

    return false;  

}

}

/* ==========================================
دریافت قیمت بازار
========================================== */

async function fetchMarketPrices() {

if (marketLoading) return;  


marketLoading = true;  


try {  

    const response = await fetch(  

        MARKET_API + "/market/stats?dstCurrency=rls",  

        {  
            method: "GET",  
            cache: "no-store"  
        }  

    );  


    if (!response.ok) {  

        throw new Error(  
            "Market API: " + response.status  
        );  

    }  


    const data = await response.json();  


    if (  
        data.status !== "ok" ||  
        !data.stats  
    ) {  

        throw new Error("Invalid market response");  

    }  


    let updated = 0;  


    coins.forEach(coin => {  

        const key =  
            coin.symbol.toLowerCase() + "-rls";  


        const market = data.stats[key];  

        if (!market) return;  


        const rialPrice = Number(market.latest);  

        const change = Number(market.dayChange);  


        if (  
            !Number.isFinite(rialPrice) ||  
            rialPrice <= 0  
        ) {  

            return;  

        }  


        // تبدیل ریال به تومان  
        coin.price = rialPrice / 10;  


        if (Number.isFinite(change)) {  

            coin.change = change;  

        }  


        updated++;  

    });  


    if (updated === 0) {  

        throw new Error("No valid market data");  

    }  


    marketConnected = true;  

    lastMarketUpdate = Date.now();  


    renderAll();  


    if (isTradePageActive()) {  

        updateTradePage();  

        updateLiveCandlePrice();  

    }  


    updateMarketStatus();  


} catch (error) {  

    console.error("Market error:", error);  

    if (  
        Date.now() - lastMarketUpdate >  
        MARKET_REFRESH_MS * 2  
    ) {  

        marketConnected = false;  

    }  

    updateMarketStatus();  


} finally {  

    marketLoading = false;  

}

}

/* ==========================================
وضعیت اتصال بازار
========================================== */

function updateMarketStatus() {

const elements = document.querySelectorAll(  
    ".market-status"  
);  


elements.forEach(element => {  

    const text =  
        element.querySelector(".status-text");  

    if (!text) return;  


    if (marketConnected) {  

        text.textContent = "بازار متصل";  

        element.classList.add("online");  

        element.classList.remove("offline");  

    } else {  

        text.textContent = "داده بازار در دسترس نیست";  

        element.classList.remove("online");  

        element.classList.add("offline");  

    }  

});

}

/* ==========================================
وضعیت صفحات
========================================== */

function isTradePageActive() {

return document.getElementById("tradePage")  
    ?.classList.contains("active");

}

function openPage(pageId) {

const page = document.getElementById(pageId);  

if (!page) return;  


document.querySelectorAll(".page").forEach(item => {  

    item.classList.remove("active");  

});  


page.classList.add("active");  


document.querySelectorAll(".nav-item").forEach(button => {  

    button.classList.toggle(  

        "active",  

        button.dataset.page === pageId  

    );  

});  


window.scrollTo({  

    top: 0,  

    behavior: "smooth"  

});  


renderAll();  


if (pageId === "tradePage") {  

    setTimeout(() => {  

        createChart();  

        updateTradePage();  

        loadChartForSelectedCoin();  

    }, 150);  

}  


if (pageId === "walletPage") {  

    renderAssets();  

}

}

/* ==========================================
انتخاب ارز
========================================== */

function selectCoin(symbol) {

const coin = getCoin(symbol);  

if (!coin) return;  


selectedCoin = symbol;  

openPage("tradePage");

}

/* ==========================================
نمایش بازار
========================================== */

function renderCoins() {

const container =  
    document.getElementById("coinList");  

if (!container) return;  


container.innerHTML = coins.map(coin => {  

    const changeClass =  
        coin.change >= 0  
            ? "positive"  
            : "negative";  


    const sign =  
        coin.change >= 0  
            ? "+"  
            : "";  


    return `  

        <div class="coin-row"  
             onclick="selectCoin('${coin.symbol}')">  

            <div class="coin-info">  

                <div class="coin-logo">  
                    ${coin.logo}  
                </div>  

                <div>  

                    <strong>${coin.name}</strong>  

                    <small>  
                        ${coin.symbol} / IRT  
                    </small>  

                </div>  

            </div>  


            <div class="coin-price">  

                ${formatNumber(coin.price)}  

            </div>  


            <div class="coin-change ${changeClass}">  

                ${sign}${formatNumber(coin.change, 2)}٪  

            </div>  

        </div>  

    `;  

}).join("");

}

/* ==========================================
نمودار
========================================== */

function createChart() {

const container =  
    document.getElementById("chart");  


if (  
    !container ||  
    !window.LightweightCharts  
) {  

    return;  

}  


if (chart) {  

    chart.remove();  

    chart = null;  

    candleSeries = null;  

}  


chart = LightweightCharts.createChart(  

    container,  

    {  

        width: container.clientWidth,  

        height: container.clientHeight || 300,  


        layout: {  

            background: {  
                color: "#111a16"  
            },  

            textColor: "#aabbb0",  

            fontFamily: "Vazirmatn"  

        },  


        grid: {  

            vertLines: {  
                color: "rgba(255,255,255,.035)"  
            },  

            horzLines: {  
                color: "rgba(255,255,255,.035)"  
            }  

        },  


        rightPriceScale: {  

            borderColor: "#26352c"  

        },  


        timeScale: {  

            borderColor: "#26352c",  

            timeVisible: true,  

            secondsVisible: false  

        },  


        crosshair: {  

            mode: 1  

        },  


        localization: {  

            priceFormatter: price => {  

                return formatNumber(price);  

            }  

        }  

    }  

);  


candleSeries = chart.addCandlestickSeries({  

    upColor: "#00d68f",  

    downColor: "#ff5364",  

    borderUpColor: "#00d68f",  

    borderDownColor: "#ff5364",  

    wickUpColor: "#00d68f",  

    wickDownColor: "#ff5364"  

});  


chart.subscribeCrosshairMove(param => {  

    if (  
        !param ||  
        !param.time ||  
        !candleSeries  
    ) {  

        return;  

    }  


    const candle =  
        param.seriesData.get(candleSeries);  


    if (candle) {  

        updateCandleInfo(candle);  

    }  

});  


if (chartResizeObserver) {  

    chartResizeObserver.disconnect();  

}  


if ("ResizeObserver" in window) {  

    chartResizeObserver = new ResizeObserver(() => {  

        resizeChart();  

    });  

    chartResizeObserver.observe(container);  

}

}

/* ==========================================
تغییر اندازه نمودار
========================================== */

function resizeChart() {

const container =  
    document.getElementById("chart");  


if (!chart || !container) return;  


chart.applyOptions({  

    width: container.clientWidth,  

    height: container.clientHeight  

});

}

/* ==========================================
اطلاعات کندل
========================================== */

function updateCandleInfo(candle) {

const fields = {  

    candleOpen: candle.open,  

    candleHigh: candle.high,  

    candleLow: candle.low,  

    candleClose: candle.close  

};  


Object.entries(fields).forEach(([id, value]) => {  

    const element = document.getElementById(id);  

    if (element) {  

        element.textContent =  
            formatNumber(value);  

    }  

});

}

/* ==========================================
دریافت تاریخچه کندل
========================================== */

async function fetchCandles() {

if (candleLoading) return;  


const coin = getCoin(selectedCoin);  

if (!coin || !candleSeries) return;  


candleLoading = true;  


const message =  
    document.getElementById("chartMessage");  


if (message) {  

    message.textContent = "در حال دریافت کندل‌ها...";  

}  


try {  

    const now = Math.floor(Date.now() / 1000);  

    const from = now - CANDLE_HISTORY_SECONDS;  


    const url =  

        MARKET_API +  

        "/market/udf/history" +  

        "?symbol=" + encodeURIComponent(coin.marketSymbol) +  

        "&resolution=" + encodeURIComponent(selectedChartPeriod) +  

        "&from=" + from +  

        "&to=" + now;  


    const response = await fetch(url, {  

        cache: "no-store"  

    });  


    if (!response.ok) {  

        throw new Error(  
            "Candle API: " + response.status  
        );  

    }  


    const result = await response.json();  


    if (  
        result.s !== "ok" ||  
        !Array.isArray(result.t) ||  
        !Array.isArray(result.o) ||  
        !Array.isArray(result.h) ||  
        !Array.isArray(result.l) ||  
        !Array.isArray(result.c)  
    ) {  

        throw new Error(  
            result.errmsg || "Invalid candle response"  
        );  

    }  


    const candles = [];  


    for (let i = 0; i < result.t.length; i++) {  

        const candle = {  

            time: Number(result.t[i]),  

            open: Number(result.o[i]) / 10,  

            high: Number(result.h[i]) / 10,  

            low: Number(result.l[i]) / 10,  

            close: Number(result.c[i]) / 10  

        };  


        if (  

            !Number.isFinite(candle.time) ||  

            !Number.isFinite(candle.open) ||  

            !Number.isFinite(candle.high) ||  

            !Number.isFinite(candle.low) ||  

            !Number.isFinite(candle.close) ||  

            candle.open <= 0 ||  

            candle.high <= 0 ||  

            candle.low <= 0 ||  

            candle.close <= 0 ||  

            candle.high < candle.low  

        ) {  

            continue;  

        }  


        candles.push(candle);  

    }  


    if (!candles.length) {  

        throw new Error("No candle data");  

    }  


    candleData = candles;  


    candleSeries.setData(candles);  


    chart.timeScale().fitContent();  


    updateCandleInfo(  
        candles[candles.length - 1]  
    );  


    if (message) {  

        message.textContent = "نمودار دریافت شد";  

    }  


} catch (error) {  

    console.error("Candle error:", error);  


    if (message) {  

        message.textContent =  
            "اطلاعات تاریخی نمودار در دسترس نیست";  

    }  

} finally {  

    candleLoading = false;  

}

}

/* ==========================================
به‌روزرسانی کندل با قیمت جدید
========================================== */

function updateLiveCandlePrice() {

const coin = getCoin(selectedCoin);  


if (  
    !coin ||  
    !candleSeries ||  
    !candleData.length ||  
    coin.price <= 0  
) {  

    return;  

}  


const last =  
    candleData[candleData.length - 1];  


const updated = {  

    time: last.time,  

    open: last.open,  

    high: Math.max(last.high, coin.price),  

    low: Math.min(last.low, coin.price),  

    close: coin.price  

};  


candleData[candleData.length - 1] = updated;  


candleSeries.update(updated);  


updateCandleInfo(updated);

}

/* ==========================================
بارگذاری نمودار
========================================== */

async function loadChartForSelectedCoin() {

const coin = getCoin(selectedCoin);  

if (!coin) return;  


if (!chart) {  

    createChart();  

}  


if (!candleSeries) return;  


candleData = [];  


await fetchCandles();

}

/* ==========================================
تغییر بازه نمودار
========================================== */

function changeChartPeriod(button) {

if (!button) return;  


const period = button.dataset.period;  


const allowedPeriods = [  

    "1",  
    "5",  
    "15",  
    "60",  
    "D"  

];  


if (!allowedPeriods.includes(period)) {  

    return;  

}  


document.querySelectorAll(  
    ".chart-periods button"  
).forEach(item => {  

    item.classList.remove("selected");  

});  


button.classList.add("selected");  


selectedChartPeriod = period;  


if (isTradePageActive()) {  

    loadChartForSelectedCoin();  

}

}

/* ==========================================
تغییر ارز پرداخت
========================================== */

function setQuoteCurrency(currency) {

if (  
    currency !== "IRT" &&  
    currency !== "USDT"  
) {  

    return;  

}  


if (currency === "USDT") {  

    showToast(  
        "قیمت USDT در این نسخه هنوز پشتیبانی نشده است"  
    );  

    return;  

}  


quoteCurrency = currency;  


document.querySelectorAll(  
    ".pair-option"  
).forEach(button => {  

    button.classList.toggle(  

        "active",  

        button.dataset.pair === currency  

    );  

});  


const description =  
    document.getElementById("pairDescription");  


if (description) {  

    description.textContent =  
        "قیمت‌ها بر حسب تومان";  

}  


updateTradePage();

}

/* ==========================================
صفحه معامله
========================================== */

function updateTradePage() {

const coin = getCoin(selectedCoin);  

if (!coin) return;  


const logo =  
    document.getElementById("tradeCoinLogo");  

const name =  
    document.getElementById("tradeCoinName");  

const symbol =  
    document.getElementById("tradeCoinSymbol");  

const price =  
    document.getElementById("tradePrice");  

const lastPrice =  
    document.getElementById("lastPrice");  

const unitPrice =  
    document.getElementById("unitPrice");  

const change =  
    document.getElementById("tradeChange");  


if (logo) {  

    logo.textContent = coin.logo;  

}  


if (name) {  

    name.textContent = coin.name;  

}  


if (symbol) {  

    symbol.textContent =  
        coin.symbol + " / " + quoteCurrency;  

}  


if (price) {  

    price.textContent =  
        formatNumber(coin.price);  

}  


if (lastPrice) {  

    lastPrice.textContent =  
        formatNumber(coin.price);  

}  


if (unitPrice) {  

    unitPrice.textContent =  
        formatNumber(coin.price);  

}  


if (change) {  

    change.textContent =  

        (coin.change >= 0 ? "+" : "") +  

        formatNumber(coin.change, 2) +  

        "٪";  


    change.className =  

        coin.change >= 0  
            ? "positive"  
            : "negative";  

}  


const amountSymbol =  
    document.getElementById("amountSymbol");  


if (amountSymbol) {  

    amountSymbol.textContent = coin.symbol;  

}  


updateTradeButton();  

updateAvailableBalance();  

updateOrderTotal();  

renderOrderBook();  

renderRecentTrades();  

renderPositions();

}

/* ==========================================
دکمه خرید و فروش
========================================== */

function updateTradeButton() {

const coin = getCoin(selectedCoin);  

const button =  
    document.getElementById("submitTrade");  


if (!coin || !button) return;  


button.className =  

    tradeType === "buy"  
        ? "submit-buy"  
        : "submit-sell";  


button.textContent =  

    (tradeType === "buy" ? "خرید " : "فروش ") +  

    coin.name;

}

function setTradeType(type) {

if (  
    type !== "buy" &&  
    type !== "sell"  
) {  

    return;  

}  


tradeType = type;  


const buyTab =  
    document.getElementById("buyTab");  

const sellTab =  
    document.getElementById("sellTab");  


if (buyTab) {  

    buyTab.classList.toggle(  
        "active",  
        type === "buy"  
    );  

}  


if (sellTab) {  

    sellTab.classList.toggle(  
        "active",  
        type === "sell"  
    );  

}  


updateTradeButton();  

updateAvailableBalance();  

updateOrderTotal();

}

/* ==========================================
موجودی قابل استفاده
========================================== */

function updateAvailableBalance() {

const coin = getCoin(selectedCoin);  

if (!coin) return;  


const label =  
    document.getElementById("availableLabel");  

const balance =  
    document.getElementById("availableBalance");  


if (!label || !balance) return;  


if (tradeType === "buy") {  

    label.textContent =  
        "موجودی نقد قابل استفاده";  


    balance.textContent =  
        formatMoney(state.cash);  

} else {  

    const holding =  
        getHolding(selectedCoin);  


    label.textContent =  
        "مقدار قابل فروش";  


    balance.textContent =  

        formatNumber(holding.amount, 8) +  

        " " +  

        coin.symbol;  

}

}

/* ==========================================
محاسبه سفارش
========================================== */

function calculateOrder(amount, coin) {

const total = amount * coin.price;  

const feeRate =  
    tradeType === "buy"  
        ? BUY_FEE  
        : SELL_FEE;  

const fee = total * feeRate;  


return {  

    total,  

    fee,  

    feeRate,  

    finalTotal:  

        tradeType === "buy"  

            ? total + fee  

            : total - fee  

};

}

function updateOrderTotal() {

const coin = getCoin(selectedCoin);  

if (!coin) return;  


const input =  
    document.getElementById("tradeAmount");  


if (!input) return;  


const amount = Number(input.value) || 0;  


const result =  
    calculateOrder(amount, coin);  


const output =  
    document.getElementById("orderTotal");  

const feeRate =  
    document.getElementById("feeRate");  

const feeAmount =  
    document.getElementById("feeAmount");  

const finalTotal =  
    document.getElementById("finalTotal");  


if (output) {  

    output.textContent =  
        formatMoney(result.total);  

}  


if (feeRate) {  

    feeRate.textContent =  

        formatNumber(  
            result.feeRate * 100,  
            2  
        ) + "٪";  

}  


if (feeAmount) {  

    feeAmount.textContent =  
        formatMoney(result.fee);  

}  


if (finalTotal) {  

    finalTotal.textContent =  
        formatMoney(result.finalTotal);  

}

}

/* ==========================================
انتخاب درصد سفارش
========================================== */

function setAmount(percent) {

const coin = getCoin(selectedCoin);  

if (  
    !coin ||  
    coin.price <= 0  
) {  

    showToast("قیمت ارز در دسترس نیست");  

    return;  

}  


let amount = 0;  


if (tradeType === "buy") {  

    const available =  
        state.cash / (1 + BUY_FEE);  


    amount =  

        (available * percent / 100) /  

        coin.price;  

} else {  

    amount =  

        getHolding(selectedCoin).amount *  

        percent / 100;  

}  


const input =  
    document.getElementById("tradeAmount");  


if (!input) return;  


input.value = amount.toFixed(8);  


updateOrderTotal();

}

/* ==========================================
ثبت معامله مجازی
========================================== */

function submitTrade() {

const coin = getCoin(selectedCoin);  

if (!coin) return;  


if (  
    !marketConnected ||  
    coin.price <= 0  
) {  

    showToast("قیمت بازار در دسترس نیست");  

    return;  

}  


const input =  
    document.getElementById("tradeAmount");  


const amount = Number(input.value);  


if (  
    !Number.isFinite(amount) ||  
    amount <= 0  
) {  

    showToast("مقدار سفارش معتبر نیست");  

    return;  

}  


if (amount > 1e15) {  

    showToast("مقدار سفارش بیش از حد مجاز است");  

    return;  

}  


const result =  
    calculateOrder(amount, coin);  


if (  
    !Number.isFinite(result.total) ||  
    !Number.isFinite(result.fee) ||  
    result.total <= 0  
) {  

    showToast("مبلغ سفارش معتبر نیست");  

    return;  

}  


if (tradeType === "buy") {  

    executeBuy(coin, amount, result);  

} else {  

    executeSell(coin, amount, result);  

}

}

/* ==========================================
خرید مجازی
========================================== */

function executeBuy(coin, amount, result) {

const required =  
    result.total + result.fee;  


if (required > state.cash) {  

    showToast("موجودی IRT برای خرید کافی نیست");  

    return;  

}  


if (!state.holdings[coin.symbol]) {  

    state.holdings[coin.symbol] = {  

        amount: 0,  

        cost: 0  

    };  

}  


state.cash -= required;  


const holding =  
    state.holdings[coin.symbol];  


holding.amount += amount;  

holding.cost += required;  


addTrade(  

    "buy",  

    coin,  

    amount,  

    result  

);  


saveState();  


document.getElementById("tradeAmount").value = "";  


updateTradePage();  

renderAll();  


showToast(  
    "خرید آزمایشی " + coin.name + " ثبت شد"  
);

}

/* ==========================================
فروش مجازی
========================================== */

function executeSell(coin, amount, result) {

const holding =  
    getHolding(coin.symbol);  


if (amount > holding.amount + 1e-12) {  

    showToast("موجودی این ارز برای فروش کافی نیست");  

    return;  

}  


const received =  
    result.total - result.fee;  


if (  
    !Number.isFinite(received) ||  
    received < 0  
) {  

    showToast("محاسبه مبلغ فروش نامعتبر است");  

    return;  

}  


const averageCost =  

    holding.amount > 0  

        ? holding.cost / holding.amount  

        : 0;  


const soldCost =  
    averageCost * amount;  


holding.amount -= amount;  

holding.cost -= soldCost;  


if (holding.amount < 1e-12) {  

    holding.amount = 0;  

    holding.cost = 0;  

}  


state.cash += received;  


addTrade(  

    "sell",  

    coin,  

    amount,  

    result  

);  


saveState();  


document.getElementById("tradeAmount").value = "";  


updateTradePage();  

renderAll();  


showToast(  
    "فروش آزمایشی " + coin.name + " ثبت شد"  
);

}

/* ==========================================
ثبت تاریخچه
========================================== */

function addTrade(type, coin, amount, result) {

const trade = {  

    id: crypto.randomUUID  
        ? crypto.randomUUID()  
        : String(Date.now()) + Math.random(),  

    type,  

    symbol: coin.symbol,  

    name: coin.name,  

    price: coin.price,  

    amount,  

    total: result.total,  

    fee: result.fee,  

    feeRate: result.feeRate,  

    time: getCurrentTime(),  

    timestamp: Date.now()  

};  


state.history.unshift(trade);  


state.history =  
    state.history.slice(0, 100);  


saveState();

}

/* ==========================================
دفتر سفارشات نمایشی
========================================== */

function renderOrderBook() {

const coin = getCoin(selectedCoin);  

if (  
    !coin ||  
    coin.price <= 0  
) {  

    return;  

}  


const asks =  
    document.getElementById("asks");  

const bids =  
    document.getElementById("bids");  


if (!asks || !bids) return;  


const askMultipliers = [  

    1.003,  

    1.002,  

    1.001,  

    1.0005,  

    1.0002  

];  


asks.innerHTML = askMultipliers.map(  
    (multiplier, index) => {  

        const price =  
            coin.price * multiplier;  


        const amount =  
            (index + 1) * 0.003;  


        return `  

            <div class="order-row">  

                <div class="depth sell"  
                     style="width:${95 - index * 13}%">  
                </div>  

                <span class="sell-color">  
                    ${formatNumber(price)}  
                </span>  

                <span>  
                    ${formatNumber(amount, 5)}  
                </span>  

                <span>فروش</span>  

            </div>  

        `;  

    }  

).reverse().join("");  


const bidMultipliers = [  

    0.9998,  

    0.9995,  

    0.999,  

    0.998,  

    0.997  

];  


bids.innerHTML = bidMultipliers.map(  
    (multiplier, index) => {  

        const price =  
            coin.price * multiplier;  


        const amount =  
            (index + 1) * 0.004;  


        return `  

            <div class="order-row">  

                <div class="depth buy"  
                     style="width:${95 - index * 13}%">  
                </div>  

                <span class="buy-color">  
                    ${formatNumber(price)}  
                </span>  

                <span>  
                    ${formatNumber(amount, 5)}  
                </span>  

                <span>خرید</span>  

            </div>  

        `;  

    }  

).join("");

}

/* ==========================================
معاملات اخیر کاربر
========================================== */

function renderRecentTrades() {

const container =  
    document.getElementById("recentTrades");  


if (!container) return;  


const trades = state.history.filter(trade => {  

    return trade.symbol === selectedCoin;  

}).slice(0, 8);  


if (!trades.length) {  

    container.innerHTML = `  

        <div class="empty-state">  
            هنوز معامله‌ای ثبت نشده است.  
        </div>  

    `;  

    return;  

}  


container.innerHTML = trades.map(trade => {  

    const isBuy =  
        trade.type === "buy";  


    return `  

        <div class="recent-row">  

            <span class="${isBuy ? "positive" : "negative"}">  
                ${isBuy ? "خرید" : "فروش"}  
            </span>  

            <strong>  
                ${formatNumber(trade.price)}  
            </strong>  

            <span>  
                ${formatNumber(trade.amount, 8)}  
            </span>  

            <span>  
                ${trade.time}  
            </span>  

        </div>  

    `;  

}).join("");

}

/* ==========================================
موقعیت‌های باز
========================================== */

function renderPositions() {

const container =  
    document.getElementById("positionsList");  


if (!container) return;  


const active = coins.filter(coin => {  

    return getHolding(coin.symbol).amount > 0;  

});  


let totalValue = 0;  

let totalPnl = 0;  


active.forEach(coin => {  

    const holding =  
        getHolding(coin.symbol);  


    const value =  
        holding.amount * coin.price;  


    const pnl =  
        value - holding.cost;  


    totalValue += value;  

    totalPnl += pnl;  

});  


const count =  
    document.getElementById("positionCount");  

const valueElement =  
    document.getElementById("positionValue");  

const pnlElement =  
    document.getElementById("positionPnl");  


if (count) {  

    count.textContent =  
        formatNumber(active.length) + " موقعیت";  

}  


if (valueElement) {  

    valueElement.textContent =  
        formatMoney(totalValue);  

}  


if (pnlElement) {  

    pnlElement.textContent =  

        (totalPnl > 0 ? "+" : "") +  

        formatMoney(totalPnl);  


    pnlElement.className =  

        totalPnl >= 0  
            ? "positive"  
            : "negative";  

}  


if (!active.length) {  

    container.innerHTML = `  

        <div class="empty-state">  
            هنوز موقعیت بازی ندارید.  
            <br>  
            برای شروع، یک ارز آزمایشی بخرید.  
        </div>  

    `;  

    return;  

}  


container.innerHTML = active.map(coin => {  

    const holding =  
        getHolding(coin.symbol);  


    const value =  
        holding.amount * coin.price;  


    const pnl =  
        value - holding.cost;  


    return `  

        <div class="position-row">  

            <strong>${coin.symbol}</strong>  

            <span>  
                ${formatNumber(holding.amount, 8)}  
            </span>  

            <span>  
                ${formatNumber(value)}  
            </span>  

            <strong class="${pnl >= 0 ? "positive" : "negative"}">  
                ${pnl > 0 ? "+" : ""}  
                ${formatNumber(pnl)}  
            </strong>  

        </div>  

    `;  

}).join("");

}

/* ==========================================
صفحه کیف پول
========================================== */

function renderAssets() {

const container =  
    document.getElementById("assetsList");  


if (!container) return;  


const totalCoins =  
    getTotalCoinValue();  


const total =  
    state.cash + totalCoins;  


const totalElement =  
    document.getElementById("walletTotal");  

const cashElement =  
    document.getElementById("walletCash");  

const coinsElement =  
    document.getElementById("walletCoins");  


if (totalElement) {  

    totalElement.innerHTML =  

        formatNumber(total) +  

        " <small>تومان</small>";  

}  


if (cashElement) {  

    cashElement.textContent =  
        formatMoney(state.cash);  

}  


if (coinsElement) {  

    coinsElement.textContent =  
        formatMoney(totalCoins);  

}  


const active = coins.filter(coin => {  

    return getHolding(coin.symbol).amount > 0;  

});  


let html = `  

    <div class="asset-row">  

        <div class="coin-info">  

            <div class="coin-logo">﷼</div>  

            <div>  

                <strong>تومان</strong>  

                <small>IRT - موجودی نقدی</small>  

            </div>  

        </div>  

        <div class="asset-value">  

            <strong>${formatMoney(state.cash)}</strong>  

            <small>موجودی آزمایشی</small>  

        </div>  

    </div>  

`;  


active.forEach(coin => {  

    const holding =  
        getHolding(coin.symbol);  


    const value =  
        holding.amount * coin.price;  


    const pnl =  
        value - holding.cost;  


    html += `  

        <div class="asset-row">  

            <div class="coin-info">  

                <div class="coin-logo">  
                    ${coin.logo}  
                </div>  

                <div>  

                    <strong>${coin.name}</strong>  

                    <small>  
                        ${formatNumber(holding.amount, 8)}  
                        ${coin.symbol}  
                    </small>  

                </div>  

            </div>  


            <div class="asset-value">  

                <strong>  
                    ${formatMoney(value)}  
                </strong>  

                <small class="${pnl >= 0 ? "positive" : "negative"}">  

                    ${pnl > 0 ? "+" : ""}  

                    ${formatMoney(pnl)}  

                </small>  

            </div>  

        </div>  

    `;  

});  


container.innerHTML = html;

}

/* ==========================================
دارایی‌های صفحه خانه
========================================== */

function renderHomeHoldings() {

const container =  
    document.getElementById("homeHoldings");  


if (!container) return;  


const active = coins.filter(coin => {  

    return getHolding(coin.symbol).amount > 0;  

});  


if (!active.length) {  

    container.innerHTML = `  

        <div class="empty-state">  
            هنوز دارایی‌ای ندارید.  
        </div>  

    `;  

    return;  

}  


container.innerHTML = active.map(coin => {  

    const holding =  
        getHolding(coin.symbol);  


    return `  

        <div class="holding-row">  

            <div>  

                <strong>${coin.name}</strong>  

                <small>  

                    ${formatNumber(holding.amount, 8)}  

                    ${coin.symbol}  

                </small>  

            </div>  


            <strong>  
                ${formatMoney(holding.amount * coin.price)}  
            </strong>  

        </div>  

    `;  

}).join("");

}

/* ==========================================
موجودی کلی
========================================== */

function renderBalances() {

const total =  
    getTotalBalance();  


const pnl =  
    getUnrealizedPnl();  


const totalElement =  
    document.getElementById("totalBalance");  

const cashElement =  
    document.getElementById("cashBalance");  

const pnlElement =  
    document.getElementById("dailyPnl");  


if (totalElement) {  

    totalElement.innerHTML =  

        formatNumber(total) +  

        " <small>تومان</small>";  

}  


if (cashElement) {  

    cashElement.textContent =  
        formatMoney(state.cash);  

}  


if (pnlElement) {  

    pnlElement.textContent =  

        (pnl > 0 ? "+" : "") +  

        formatMoney(pnl);  


    pnlElement.className =  

        pnl >= 0  
            ? "positive"  
            : "negative";  

}

}

/* ==========================================
افزایش موجودی مجازی
========================================== */

function openDepositModal() {

const modal =  
    document.getElementById("depositModal");  


if (modal) {  

    modal.classList.add("show");  

}

}

function closeDepositModal() {

const modal =  
    document.getElementById("depositModal");  


if (modal) {  

    modal.classList.remove("show");  

}

}

function setDepositAmount(amount) {

const input =  
    document.getElementById("depositAmount");  


if (input) {  

    input.value = amount;  

}

}

function confirmDemoDeposit() {

const input =  
    document.getElementById("depositAmount");  


if (!input) return;  


const amount = Number(input.value);  


if (  
    !Number.isFinite(amount) ||  
    amount < 1000  
) {  

    showToast("مبلغ باید حداقل ۱۰۰۰ تومان باشد");  

    return;  

}  


if (amount > 1000000000) {  

    showToast("مبلغ انتخاب‌شده بیش از حد مجاز است");  

    return;  

}  


state.cash += amount;  


saveState();  


input.value = "";  


closeDepositModal();  


renderAll();  


showToast(  
    "موجودی آزمایشی افزایش پیدا کرد"  
);

}

/* ==========================================
تازه‌سازی رابط
========================================== */

function renderAll() {

renderBalances();  

renderCoins();  

renderHomeHoldings();  

renderPositions();  

renderAssets();  

updateMarketStatus();

}

function refreshUI() {

renderAll();  


if (isTradePageActive()) {  

    updateTradePage();  

}

}

/* ==========================================
رویدادهای ورودی
========================================== */

function setupEvents() {

const amountInput =  
    document.getElementById("tradeAmount");  


if (amountInput) {  

    amountInput.addEventListener(  
        "input",  
        updateOrderTotal  
    );  

}  


const refreshButton =  
    document.getElementById("refreshBtn");  


if (refreshButton) {  

    refreshButton.addEventListener(  
        "click",  
        async () => {  

            await fetchMarketPrices();  

            if (isTradePageActive()) {  

                await fetchCandles();  

            }  

            showToast("بررسی اطلاعات بازار انجام شد");  

        }  
    );  

}  


document.querySelectorAll(  
    ".chart-periods button"  
).forEach(button => {  

    button.addEventListener(  
        "click",  
        () => changeChartPeriod(button)  
    );  

});  


const modal =  
    document.getElementById("depositModal");  


if (modal) {  

    modal.addEventListener("click", event => {  

        if (event.target === modal) {  

            closeDepositModal();  

        }  

    });  

}

}

/* ==========================================
شروع برنامه
========================================== */

function startApp() {

console.log("BaleTrade started");  


setupEvents();  


renderAll();  


setTradeType("buy");  


updateTradePage();  


fetchMarketPrices();  


marketTimer = setInterval(() => {  

    fetchMarketPrices();  

}, MARKET_REFRESH_MS);  


uiTimer = setInterval(() => {  

    refreshUI();  

}, UI_REFRESH_MS);  


if (isTradePageActive()) {  

    setTimeout(() => {  

        loadChartForSelectedCoin();  

    }, 300);  

}

}

/* ==========================================
اجرای برنامه
========================================== */

startApp();

