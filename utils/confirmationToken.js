async function pollForConfirmationEmail(email, { timeoutMs = 10000, intervalMs = 500 } = {}) {
  const start = Date.now();
  let lastError;

  while (Date.now() - start < timeoutMs) {
    try {
      return await getConfirmationTokenAndEmail(email);
    } catch (err) {
      lastError = err;
      await new Promise((r) => setTimeout(r, intervalMs));
    }
  }

  throw new Error(`pollForConfirmationEmail: no email arrived within ${timeoutMs}ms. Last error: ${lastError.message}`);
}

async function getConfirmationTokenAndEmail(email) {
  const searchRes = await fetch(
    `http://127.0.0.1:8025/api/v1/search?query=to:${encodeURIComponent(email)}`
  );
  const searchData = await searchRes.json();
  if (!searchData.messages || searchData.messages.length === 0) {
    throw new Error(`No email found for ${email}`);
  }

  const messageId = searchData.messages[0].ID;
  const messageRes = await fetch(`http://127.0.0.1:8025/api/v1/message/${messageId}`);
  const messageData = await messageRes.json();
  const body = messageData.HTML || messageData.Text;

  // Handles both raw "&" (plain text version) and HTML-entity "&amp;" (HTML version)
  const emailMatch = body.match(/[?&](?:amp;)?email=([^&"'\s]+)/);
  const tokenMatch = body.match(/[?&](?:amp;)?token=([^&"'\s]+)/);

  if (!emailMatch || !tokenMatch) {
    throw new Error(`Could not find email/token in message body:\n${body}`);
  }

  console.log('Email is: ', decodeURIComponent(emailMatch[1]));
  console.log('Token is: ', decodeURIComponent(tokenMatch[1]));


  return {
    email: decodeURIComponent(emailMatch[1]),
    token: decodeURIComponent(tokenMatch[1]),
  };
}

module.exports = pollForConfirmationEmail;