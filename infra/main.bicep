targetScope = 'resourceGroup'

@description('The azd environment name used for resource naming and resource discovery.')
param environmentName string

@description('Deployment location for the App Service resources.')
param location string = resourceGroup().location

@description('Optional override for the Azure App Service web app name. Leave empty to generate one.')
param WEB_APP_NAME string = ''

@description('Optional override for the App Service plan name. Leave empty to derive it from the web app name.')
param APP_SERVICE_PLAN_NAME string = ''

@allowed([
  'B1'
  'B2'
  'B3'
  'S1'
  'S2'
  'S3'
  'P0v3'
  'P1v3'
  'P2v3'
])
@description('SKU name for the App Service plan. Basic B1 is a low-cost starting point that still supports Always On and WebSockets.')
param APP_SERVICE_PLAN_SKU_NAME string = 'B1'

@allowed([
  'Basic'
  'Standard'
  'PremiumV3'
])
@description('SKU tier for the App Service plan.')
param APP_SERVICE_PLAN_SKU_TIER string = 'Basic'

@description('Linux runtime for the Node.js web app.')
param NODE_RUNTIME string = 'NODE|22-lts'

@description('FYERS client identifier.')
param FYERS_CLIENT_ID string

@secure()
@description('FYERS secret key.')
param FYERS_SECRET_KEY string

@description('FYERS user identifier.')
param FYERS_USER_ID string

@secure()
@description('FYERS TOTP key.')
param FYERS_TOTP_KEY string

@secure()
@description('Optional FYERS PIN fallback used by backend login automation.')
param FYERS_PIN string = ''

@description('Relative path inside the app for the persisted token file.')
param FYERS_TOKEN_FILE string = '.tokens/fyers_token.json'

@description('Optional outbound static IP that FYERS should trust for live orders.')
param FYERS_ORDER_STATIC_IP string = ''

@description('Whether to provision managed outbound egress for the App Service by using regional VNet integration and a NAT Gateway.')
param ENABLE_MANAGED_OUTBOUND_EGRESS string = 'false'

@description('Address space for the optional virtual network used by App Service outbound integration.')
param OUTBOUND_VNET_ADDRESS_PREFIX string = '10.240.0.0/24'

@description('Subnet prefix for the App Service outbound integration subnet. Use at least /27 for headroom and /26 if you expect higher scale.')
param OUTBOUND_INTEGRATION_SUBNET_PREFIX string = '10.240.0.0/26'

@description('Whether the backend should enforce the FYERS outbound static IP check. App Service users normally start with false unless they have fixed outbound networking in place.')
param FYERS_ENFORCE_STATIC_IP_CHECK string = 'false'

@description('Public IP discovery endpoint used by the backend static IP check.')
param PUBLIC_IP_CHECK_URL string = 'https://api.ipify.org'

@description('Paper-trading mode flag for order placement.')
param FYERS_PAPER_TRADE_MODE string = 'true'

@description('Optional public frontend URL override. Leave empty to use the default azurewebsites.net hostname.')
param FRONTEND_URL string = ''

@description('Optional FYERS redirect URI override. Leave empty to derive it from the frontend URL.')
param FYERS_REDIRECT_URI string = ''

@description('Optional resource tags applied to App Service resources.')
param TAGS object = {}

var generatedWebAppName = toLower(take('tradebuddy-${environmentName}-${uniqueString(subscription().subscriptionId, resourceGroup().id, environmentName)}', 60))
var webAppName = empty(WEB_APP_NAME) ? generatedWebAppName : toLower(WEB_APP_NAME)
var appServicePlanName = empty(APP_SERVICE_PLAN_NAME) ? '${webAppName}-plan' : APP_SERVICE_PLAN_NAME
var outboundVnetName = take('${webAppName}-outbound-vnet', 64)
var outboundIntegrationSubnetName = 'appsvc-integration'
var outboundNatGatewayName = take('${webAppName}-nat', 80)
var outboundPublicIpName = take('${webAppName}-egress-ip', 80)
var enableManagedOutboundEgress = contains([
  '1'
  'true'
  'yes'
  'on'
], toLower(trim(ENABLE_MANAGED_OUTBOUND_EGRESS)))
var enforceStaticIpCheck = contains([
  '1'
  'true'
  'yes'
  'on'
], toLower(trim(FYERS_ENFORCE_STATIC_IP_CHECK)))
var paperTradeMode = contains([
  '1'
  'true'
  'yes'
  'on'
], toLower(trim(FYERS_PAPER_TRADE_MODE)))
var effectiveFrontendUrl = empty(FRONTEND_URL) ? 'https://${webAppName}.azurewebsites.net' : FRONTEND_URL
var effectiveRedirectUri = empty(FYERS_REDIRECT_URI) ? '${effectiveFrontendUrl}/api/auth/callback' : FYERS_REDIRECT_URI
var effectiveOrderStaticIp = enableManagedOutboundEgress ? outboundPublicIp!.properties.ipAddress : FYERS_ORDER_STATIC_IP
var commonTags = union(TAGS, {
  app: 'tradebuddybot'
  'azd-env-name': environmentName
  'azd-service-name': 'web'
})
var appSettings = [
  {
    name: 'NODE_ENV'
    value: 'production'
  }
  {
    name: 'EMBED_SCANNER_SERVICE'
    value: 'true'
  }
  {
    name: 'ENABLE_ORYX_BUILD'
    value: 'true'
  }
  {
    name: 'SCM_DO_BUILD_DURING_DEPLOYMENT'
    value: 'true'
  }
  {
    name: 'NPM_CONFIG_PRODUCTION'
    value: 'false'
  }
  {
    name: 'WEBSITE_HEALTHCHECK_MAXPINGFAILURES'
    value: '5'
  }
  {
    name: 'FYERS_CLIENT_ID'
    value: FYERS_CLIENT_ID
  }
  {
    name: 'FYERS_SECRET_KEY'
    value: FYERS_SECRET_KEY
  }
  {
    name: 'FYERS_REDIRECT_URI'
    value: effectiveRedirectUri
  }
  {
    name: 'FYERS_USER_ID'
    value: FYERS_USER_ID
  }
  {
    name: 'FYERS_TOTP_KEY'
    value: FYERS_TOTP_KEY
  }
  {
    name: 'FYERS_PIN'
    value: FYERS_PIN
  }
  {
    name: 'FYERS_TOKEN_FILE'
    value: FYERS_TOKEN_FILE
  }
  {
    name: 'FYERS_ORDER_STATIC_IP'
    value: effectiveOrderStaticIp
  }
  {
    name: 'FYERS_ENFORCE_STATIC_IP_CHECK'
    value: enforceStaticIpCheck ? 'true' : 'false'
  }
  {
    name: 'PUBLIC_IP_CHECK_URL'
    value: PUBLIC_IP_CHECK_URL
  }
  {
    name: 'FYERS_PAPER_TRADE_MODE'
    value: paperTradeMode ? 'true' : 'false'
  }
  {
    name: 'FRONTEND_URL'
    value: effectiveFrontendUrl
  }
]

var webAppNetworkProperties = enableManagedOutboundEgress ? {
  virtualNetworkSubnetId: outboundIntegrationSubnet.id
  vnetRouteAllEnabled: true
} : {}

// Linux App Service plan for the Node.js app.
resource appServicePlan 'Microsoft.Web/serverfarms@2024-04-01' = {
  name: appServicePlanName
  location: location
  kind: 'linux'
  sku: {
    name: APP_SERVICE_PLAN_SKU_NAME
    tier: APP_SERVICE_PLAN_SKU_TIER
    size: APP_SERVICE_PLAN_SKU_NAME
    capacity: 1
  }
  properties: {
    reserved: true
  }
  tags: commonTags
}

// Optional outbound networking stack used to give the App Service a stable public egress IP.
resource outboundPublicIp 'Microsoft.Network/publicIPAddresses@2024-05-01' = if (enableManagedOutboundEgress) {
  name: outboundPublicIpName
  location: location
  sku: {
    name: 'Standard'
  }
  properties: {
    publicIPAllocationMethod: 'Static'
    publicIPAddressVersion: 'IPv4'
    idleTimeoutInMinutes: 4
  }
  tags: commonTags
}

resource outboundNatGateway 'Microsoft.Network/natGateways@2024-05-01' = if (enableManagedOutboundEgress) {
  name: outboundNatGatewayName
  location: location
  sku: {
    name: 'Standard'
  }
  properties: {
    idleTimeoutInMinutes: 4
    publicIpAddresses: [
      {
        id: outboundPublicIp.id
      }
    ]
  }
  tags: commonTags
}

resource outboundVnet 'Microsoft.Network/virtualNetworks@2024-05-01' = if (enableManagedOutboundEgress) {
  name: outboundVnetName
  location: location
  properties: {
    addressSpace: {
      addressPrefixes: [
        OUTBOUND_VNET_ADDRESS_PREFIX
      ]
    }
  }
  tags: commonTags
}

resource outboundIntegrationSubnet 'Microsoft.Network/virtualNetworks/subnets@2024-05-01' = if (enableManagedOutboundEgress) {
  parent: outboundVnet
  name: outboundIntegrationSubnetName
  properties: {
    addressPrefix: OUTBOUND_INTEGRATION_SUBNET_PREFIX
    delegations: [
      {
        name: 'appservice'
        properties: {
          serviceName: 'Microsoft.Web/serverFarms'
        }
      }
    ]
    natGateway: {
      id: outboundNatGateway.id
    }
    serviceEndpoints: [
      {
        service: 'Microsoft.Storage'
      }
    ]
  }
}

// Single App Service site serving the Express backend, scanner routes, and built Vite frontend.
resource webApp 'Microsoft.Web/sites@2024-04-01' = {
  name: webAppName
  location: location
  kind: 'app,linux'
  identity: {
    type: 'SystemAssigned'
  }
  properties: union({
    serverFarmId: appServicePlan.id
    httpsOnly: true
    clientAffinityEnabled: false
    publicNetworkAccess: 'Enabled'
    reserved: true
    siteConfig: {
      linuxFxVersion: NODE_RUNTIME
      appCommandLine: 'npm start'
      alwaysOn: true
      healthCheckPath: '/api/health'
      ftpsState: 'Disabled'
      minTlsVersion: '1.2'
      scmMinTlsVersion: '1.2'
      http20Enabled: true
      webSocketsEnabled: true
      appSettings: appSettings
    }
  }, webAppNetworkProperties)
  tags: commonTags
}

output AZURE_WEB_APP_NAME string = webApp.name
output AZURE_WEB_APP_URL string = 'https://${webApp.properties.defaultHostName}'
output SERVICE_WEB_ENDPOINT_URL string = 'https://${webApp.properties.defaultHostName}'
output MANAGED_IDENTITY_PRINCIPAL_ID string = webApp.identity.principalId
output MANAGED_OUTBOUND_STATIC_IP string = enableManagedOutboundEgress ? outboundPublicIp!.properties.ipAddress : ''
