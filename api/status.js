const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      type: "service_account",
      project_id: process.env.FIREBASE_PROJECT_ID,
      private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
      private_key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      client_email: process.env.FIREBASE_CLIENT_EMAIL,
      client_id: process.env.FIREBASE_CLIENT_ID,
      auth_uri: "https://accounts.google.com/o/oauth2/auth",
      token_uri: "https://oauth2.googleapis.com/token",
      auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs"
    })
  });
}

const db = admin.firestore();

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');

  try {
    const pedidoId = req.url.split('/').pop();
    const pedidoDoc = await db.collection('pedidos').doc(pedidoId).get();
    
    if (!pedidoDoc.exists) {
      return res.status(404).json({ error: 'Pedido não encontrado' });
    }

    const pedido = pedidoDoc.data();

    res.json({
      pedidoId: pedidoId,
      statusPagamento: pedido.statusPagamento || 'aguardando',
      mercadoPagoStatus: pedido.mercadoPagoStatus || null
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};