const globalConfig = {
    baseUrl: process.env.BASE_URL || 'https://dev.sunbirded.org',
    apiAuthKey: process.env.AUTH_KEY || '',
    username: process.env.USERNAME || '',
    password: process.env.PASSWORD || '',
    userToken: process.env.TOKEN || '',
    clientId: process.env.CLIENT_ID || '',
    clientSecret: process.env.CLIENT_SECRET || '',
    grant_type: process.env.GRANT_TYPE || 'password',
    channelId: process.env.CHANNEL_ID || '',
    createdBy: process.env.CREATED_BY || '',
    organisation: process.env.ORGANISATION ? [process.env.ORGANISATION] : ['FMPS Org'],
    framework: process.env.FRAMEWORK || 'FMPS',
    mimeType: process.env.MIME_TYPE || 'application/vnd.ekstep.ecml-archive',
    creator: process.env.CREATOR || 'Content Creator',
}

export default globalConfig;