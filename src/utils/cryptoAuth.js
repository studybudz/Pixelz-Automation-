const crypto = require('crypto');

const verifyTelegramAuth = (initDataRaw, botToken) => {
  if (!initDataRaw) return { isValid: false, user: null };

  try {
    const params = new URLSearchParams(initDataRaw);
    const hash = params.get('hash');
    params.delete('hash');

    const sortedParams = Array.from(params.entries())
      .map(([key, value]) => `${key}=${value}`)
      .sort()
      .join('\n');

    const secretKey = crypto
      .createHmac('sha256', 'WebAppData')
      .update(botToken)
      .digest();

    const calculatedHash = crypto
      .createHmac('sha256', secretKey)
      .update(sortedParams)
      .digest('hex');

    if (calculatedHash !== hash) {
      return { isValid: false, user: null };
    }

    const userDataStr = params.get('user');
    const user = userDataStr ? JSON.parse(userDataStr) : null;

    return { isValid: true, user };
  } catch (error) {
    console.error(`[Crypto Validation Fault]: ${error.message}`);
    return { isValid: false, user: null };
  }
};

module.exports = { verifyTelegramAuth };