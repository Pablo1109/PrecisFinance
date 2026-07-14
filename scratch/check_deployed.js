const https = require('https');

https.get('https://precis-finance-rho.vercel.app/', (res) => {
  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
  });
  res.on('end', () => {
    console.log('Status code:', res.statusCode);
    console.log('Headers:', res.headers);
    console.log('Body length:', data.length);
    const match = data.match(/<script[^>]*src="([^"]+)"/);
    console.log('Script match:', match ? match[0] : 'None');
    console.log('Sample body:', data.slice(0, 1000));
  });
}).on('error', (err) => {
  console.error('Error:', err.message);
});
