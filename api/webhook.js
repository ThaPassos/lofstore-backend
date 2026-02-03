const mercadopago = require('mercadopago');
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

mercadopago.configure({
  access_token: process.env.MP_ACCESS_TOKEN
});

module.exports = async (req, res) => {
  console.log('Webhook recebido');

  if (req.method !== 'POST') {
    return res.status(405).end();
  }

  try {
    const { type, data } = req.body;

    if (type === 'payment') {
      const pagamentoId = data.id;
      const pagamento = await mercadopago.payment.findById(pagamentoId);
      
      const pedidoId = pagamento.body.external_reference;
      const status = pagamento.body.status;

      console.log(`Pagamento ${pagamentoId} - Status: ${status}`);

      let statusPedido;
      switch (status) {
        case 'approved': statusPedido = 'pago'; break;
        case 'pending':
        case 'in_process': statusPedido = 'pendente'; break;
        case 'rejected':
        case 'cancelled': statusPedido = 'cancelado'; break;
        default: statusPedido = 'aguardando';
      }

      await db.collection('pedidos').doc(pedidoId).update({
        statusPagamento: statusPedido,
        mercadoPagoStatus: status,
        pagamentoAtualizado: new Date().toISOString(),
        dadosPagamento: {
          id: pagamento.body.id,
          status: status,
          metodoPagamento: pagamento.body.payment_method_id,
          valorPago: pagamento.body.transaction_amount
        }
      });

      console.log(`Pedido ${pedidoId} atualizado: ${statusPedido}`);
    }

    res.status(200).send('OK');

  } catch (error) {
    console.error('Erro webhook:', error);
    res.status(500).send('ERROR');
  }
};