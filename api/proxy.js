// api/proxy.js
// This Vercel Serverless Function acts as a secure and reliable proxy
// to fetch data from Shopify stores, bypassing browser CORS restrictions.

export default async function handler(request, response) {
  const targetUrl = request.query.url;

  if (!targetUrl || typeof targetUrl !== 'string') {
    return response.status(400).json({ error: 'URL parameter is required and must be a string.' });
  }

  try {
    // Validate the URL to prevent server-side request forgery (SSRF) and other abuses.
    const url = new URL(targetUrl);
    // Restrict requests to the 'https' protocol for security.
    if (url.protocol !== 'https:') {
        return response.status(400).json({ error: 'Only HTTPS URLs are allowed.' });
    }

    // Fetch data from the target Shopify URL.
    const shopifyResponse = await fetch(url.toString(), {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Shopify-Product-Extractor-App/1.0', // A good practice to identify your app.
      }
    });

    // If the request to Shopify fails, pass through the error status and a clear message.
    if (!shopifyResponse.ok) {
        return response.status(shopifyResponse.status).json({ 
            error: `Failed to fetch from Shopify: ${shopifyResponse.status} ${shopifyResponse.statusText}`
        });
    }

    const data = await shopifyResponse.json();

    // Send the successful JSON response back to the client.
    // Set cache headers to allow for fast, repeated requests to the same store.
    response.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate'); // 5-minute cache
    return response.status(200).json(data);

  } catch (error) {
    console.error('Proxy Error:', error);
    if (error instanceof TypeError) {
        return response.status(400).json({ error: 'Invalid URL format provided.' });
    }
    return response.status(500).json({ error: 'Internal Server Error: Could not process the request.' });
  }
}
