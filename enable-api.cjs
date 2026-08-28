const { GoogleAuth } = require('google-auth-library');

async function main() {
  try {
    console.log("Getting google auth client...");
    const auth = new GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/cloud-platform']
    });
    const client = await auth.getClient();
    console.log("Getting access token...");
    const tokenResponse = await client.getAccessToken();
    const token = tokenResponse.token;
    console.log("Access token retrieved. Length:", token ? token.length : 0);

    const projectNumber = "725921555856";
    const url = `https://serviceusage.googleapis.com/v1/projects/${projectNumber}/services/identitytoolkit.googleapis.com:enable`;
    
    console.log(`Sending POST to ${url}...`);
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({})
    });

    const data = await res.json();
    console.log("Response status:", res.status);
    console.log("Response data:", JSON.stringify(data, null, 2));
  } catch (error) {
    console.error("Error enabling API:", error);
  }
}

main();
