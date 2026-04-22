export async function getPublicIp(url) {
  const response = await fetch(url, { method: 'GET' });
  if (!response.ok) {
    throw new Error(`Unable to resolve public IP (${response.status})`);
  }
  return (await response.text()).trim();
}

export async function ensureStaticIp(settings) {
  const currentIp = await getPublicIp(settings.ipCheckUrl);

  if (!settings.enforceStaticIpCheck) {
    return currentIp;
  }

  const expectedIp = String(settings.orderStaticIp || '').trim();
  if (!expectedIp) {
    throw new Error('Static IP check is enabled but FYERS_ORDER_STATIC_IP is not configured.');
  }

  if (currentIp !== expectedIp) {
    throw new Error(`Order blocked: current public IP ${currentIp} does not match configured static IP ${expectedIp}.`);
  }

  return currentIp;
}
