const mercadopago = require('mercadopago');
const admin = require('firebase-admin');

// Inicializar Firebase (apenas uma vez)
if (!admin.apps.length) {
  try {
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
    console.log('✅ Firebase inicializado');
  } catch (error) {
    console.error('❌ Erro Firebase:', error);
  }
}

const db = admin.firestore();

// Configurar Mercado Pago
mercadopago.configure({
  access_token: process.env.MP_ACCESS_TOKEN
});

module.exports = async (req, res) => {
  // CORS
  const allowedOrigins = [
    'https://lofstore.com.br',
    'http://localhost:3000',
    'http://127.0.0.1:3000'
  ];
  
  const origin = req.headers.origin;
  
  if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Max-Age', '86400');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Método não permitido' });
  }

  try {
    const { pedidoId, itens, total, cliente } = req.body;

    console.log('📦 Criando pagamento para pedido:', pedidoId);

    // Validações
    if (!pedidoId || !itens || !cliente) {
      return res.status(400).json({ 
        success: false, 
        message: 'Dados incompletos'
      });
    }

    if (!Array.isArray(itens) || itens.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Carrinho vazio' 
      });
    }

    // Formata telefone corretamente (SOMENTE NÚMEROS)
    const telefoneNumeros = String(cliente.telefone || '').replace(/\D/g, '');
    const telefoneFormatado = telefoneNumeros.length >= 10 ? telefoneNumeros : '11999999999';

    console.log('Telefone original:', cliente.telefone);
    console.log('Telefone formatado:', telefoneFormatado);

    // Mapeia itens para o formato do Mercado Pago
    const itensMercadoPago = itens.map(item => ({
      title: item.nome,
      unit_price: Number(item.preco),
      quantity: Number(item.quantidade || 1),
      currency_id: 'BRL'
    }));

    // Cria preferência de pagamento
    const preference = {
      items: itensMercadoPago,
      payer: {
        name: cliente.nome,
        email: cliente.email,
        phone: {
          area_code: telefoneFormatado.substring(0, 2), // DDD
          number: Number(telefoneFormatado.substring(2)) // Número como INTEGER
        }
      },
      external_reference: pedidoId,
      back_urls: {
        success: `${process.env.FRONTEND_URL}/pagamento-sucesso.html?pedido=${pedidoId}`,
        failure: `${process.env.FRONTEND_URL}/pagamento-falha.html`,
        pending: `${process.env.FRONTEND_URL}/pagamento-pendente.html`
      },
      auto_return: 'approved',
      notification_url: `${process.env.BACKEND_URL}/webhook`,
      payment_methods: { 
        installments: 12 
      },
      metadata: { 
        pedido_id: pedidoId, 
        cliente_email: cliente.email 
      }
    };

    console.log('📞 Preferência:', JSON.stringify(preference, null, 2));

    const response = await mercadopago.preferences.create(preference);

    // Atualiza pedido no Firebase
    await db.collection('pedidos').doc(pedidoId).update({
      mercadoPagoId: response.body.id,
      linkPagamento: response.body.init_point,
      statusPagamento: 'aguardando',
      atualizadoEm: new Date().toISOString()
    });

    console.log('✅ Pagamento criado!');

    res.json({
      success: true,
      link: response.body.init_point,
      preferenceId: response.body.id
    });

  } catch (error) {
    console.error('❌ Erro:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message,
      detalhes: error.stack
    });
  }
};