import fyersPackage from 'fyers-api-v3';

const { fyersModel } = fyersPackage;

function toUnixRange(dateValue, isEndOfDay = false) {
  const date = new Date(dateValue);
  const utcDate = isEndOfDay
    ? Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 23, 59, 59, 999)
    : Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0, 0);
  return Math.floor(utcDate / 1000);
}

export function createSessionClient({ clientId, redirectUri }) {
  const client = new fyersModel({ path: '', enableLogging: false });
  client.setAppId(clientId);
  client.setRedirectUrl(redirectUri);
  return client;
}

export class FyersApiService {
  constructor({ clientId, accessToken }) {
    this.client = new fyersModel({ path: '', enableLogging: false });
    this.client.setAppId(clientId);
    this.client.setAccessToken(accessToken);
  }

  profile() {
    return this.client.get_profile();
  }

  funds() {
    return this.client.get_funds();
  }

  holdings() {
    return this.client.get_holdings();
  }

  positions() {
    return this.client.get_positions();
  }

  orderbook() {
    return this.client.get_orders();
  }

  tradebook() {
    return this.client.get_tradebook();
  }

  quotes(symbols) {
    return this.client.getQuotes(symbols);
  }

  getPriceAlert(payload) {
    return this.client.getPriceAlert(payload);
  }

  createPriceAlert(payload) {
    return this.client.createPriceAlert(payload);
  }

  modifyPriceAlert(payload) {
    return this.client.modifyPriceAlert(payload);
  }

  togglePriceAlert(payload) {
    return this.client.togglePriceAlert(payload);
  }

  deletePriceAlert(payload) {
    return this.client.deletePriceAlert(payload);
  }

  history(symbol, resolution, startDate, endDate) {
    return this.client.getHistory({
      symbol,
      resolution,
      date_format: '0',
      range_from: String(toUnixRange(startDate, false)),
      range_to: String(toUnixRange(endDate, true)),
      cont_flag: '1',
    });
  }

  placeOrder(orderData) {
    return this.client.place_order(orderData);
  }
}
