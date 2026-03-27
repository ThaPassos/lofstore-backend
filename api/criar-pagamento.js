const admin = require('firebase-admin');

// =================== FIREBASE ===================
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

// =================== FUNÇÃO ===================
module.exports = async (req, res) => {

  // =================== CORS ===================
  const allowedOrigins = [
    'https://lofstore.com.br',
    'http://localhost:3000'
  ];

  const origin = req.headers.origin;
  res.setHeader(
    'Access-Control-Allow-Origin',
    allowedOrigins.includes(origin) ? origin : '*'
  );

  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Método não permitido' });
  }

  try {
    const { pedidoId, itens, cliente } = req.body;

    console.log('📦 Pedido:', pedidoId);
    console.log('📦 Body:', JSON.stringify(req.body, null, 2));

    // =================== VALIDAÇÕES ===================
    if (!pedidoId || !itens || !cliente) {
      throw new Error('Dados incompletos');
    }

    if (!Array.isArray(itens) || itens.length === 0) {
      throw new Error('Carrinho vazio');
    }

    // =================== HANDLE ===================
    const handle = process.env.INFINITEPAY_API_KEY;

    if (!handle) {
      throw new Error('Handle da InfinitePay não configurado');
    }

    console.log('🏷️ Handle:', handle);

    // =================== ITENS ===================
    const itensMapeados = itens.map(item => {
      const quantidade = Math.max(1, parseInt(item.quantidade) || 1);
      const preco = Math.round((parseFloat(item.preco) || 0) * 100);

      if (preco < 1) {
        throw new Error(`Preço inválido: ${item.nome}`);
      }

      return {
        quantity: quantidade,
        price: preco,
        description: String(item.nome || 'Produto').substring(0, 100)
      };
    });

    // =================== EMAIL ===================
    let email = cliente.email;

    if (!email || !email.includes('@')) {
      console.log('⚠️ Email inválido, usando fallback');
      email = 'teste@teste.com';
    }

    // =================== TELEFONE ===================
    let telefone = String(cliente.telefone || '').replace(/\D/g, '');

    if (telefone.length === 10 || telefone.length === 11) {
      telefone = `+55${telefone}`;
    } else if (!telefone.startsWith('55')) {
      telefone = '+5511999999999';
    } else {
      telefone = `+${telefone}`;
    }

    console.log('📱 Telefone final:', telefone);

    // =================== URLS ===================
    const frontendUrl = process.env.FRONTEND_URL || 'https://lofstore.com.br';
    const backendUrl = process.env.BACKEND_URL || 'https://lofstore-backend.vercel.app';

    // =================== PAYLOAD ===================
    const payload = {
      handle: handle,
      order_nsu: pedidoId,
      redirect_url: `${frontendUrl}/pagamento-sucesso.html?pedido=${pedidoId}`,
      webhook_url: `${backendUrl}/webhook`,
      items: itensMapeados,
      customer: {
        name: String(cliente.nome || 'Cliente'),
        email: email,
        phone_number: telefone
      }
    };

    console.log('🚨 PAYLOAD FINAL:', JSON.stringify(payload, null, 2));

    // =================== REQUEST ===================
    const response = await fetch('https://api.infinitepay.io/invoices/public/checkout/links', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const text = await response.text();

    console.log('📥 Status:', response.status);
    console.log('📥 Resposta:', text);

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error('Resposta inválida da InfinitePay');
    }

    if (!response.ok) {
      throw new Error(data.message || 'Erro ao criar pagamento');
    }

    const link = data.url || data.checkout_url || data.link;

    if (!link) {
      throw new Error('Link não retornado');
    }

    // =================== FIREBASE ===================
    await db.collection('pedidos').doc(pedidoId).update({
      linkPagamento: link,
      statusPagamento: 'aguardando',
      atualizadoEm: new Date().toISOString()
    });

    console.log('✅ Link criado:', link);

    return res.json({
      success: true,
      link
    });

  } catch (error) {
    console.error('❌ ERRO:', error);

    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};