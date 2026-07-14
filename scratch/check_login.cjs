const https = require('https');

https.get('https://precis-finance-rho.vercel.app/login', (res) => {
  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
  });
  res.on('end', () => {
    console.log('Status code:', res.statusCode);
    console.log('Headers:', res.headers);
    console.log('Body length:', data.length);
  });
}).on('error', (err) => {
  console.error('Error:', err.message);
});
