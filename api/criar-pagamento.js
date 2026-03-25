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

// =================== CRIAR PAGAMENTO INFINITEPAY ===================
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

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Método não permitido' });
  }

  try {
    const { pedidoId, itens, total, cliente } = req.body;

    console.log('📦 Criando link de pagamento InfinitePay para pedido:', pedidoId);

    // Validações
    if (!pedidoId || !itens || !cliente) {
      return res.status(400).json({ success: false, message: 'Dados incompletos' });
    }

    if (!Array.isArray(itens) || itens.length === 0) {
      return res.status(400).json({ success: false, message: 'Carrinho vazio' });
    }

    // Calcula o total com segurança
    const totalCalculado = itens.reduce((acc, item) => {
      return acc + (Number(item.preco) * Number(item.quantidade || 1));
    }, 0);

    // Monta descrição dos itens
    const descricaoItens = itens
      .map(item => `${item.nome} (x${item.quantidade || 1})`)
      .join(', ');

    // =================== CHAMADA À API INFINITEPAY ===================
    // Documentação: https://developers.infinitepay.io
    const payload = {
      amount: Math.round(totalCalculado * 100), // InfinitePay usa centavos
      description: `Pedido #${pedidoId.substring(0, 8).toUpperCase()} - ${descricaoItens}`.substring(0, 200),
      external_reference: pedidoId, // ID do pedido no Firebase — usado no webhook
      customer: {
        name: cliente.nome,
        email: cliente.email,
        document: cliente.cpf || '', // CPF opcional — preencha se tiver
        phone: String(cliente.telefone || '').replace(/\D/g, '')
      },
      payment_methods: ['credit', 'debit', 'pix'], // aceita todos os métodos
      expires_in: 1440, // link expira em 24h (em minutos)
      notification_url: `${process.env.BACKEND_URL}/webhook`, // webhook InfinitePay
      success_url: `${process.env.FRONTEND_URL}/pagamento-sucesso.html?pedido=${pedidoId}`,
      failure_url: `${process.env.FRONTEND_URL}/pagamento-falha.html`
    };

    console.log('📤 Enviando para InfinitePay:', JSON.stringify(payload, null, 2));

    const response = await fetch('https://api.infinitepay.io/v2/payment_links', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.INFINITEPAY_API_KEY}`
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    console.log('📥 Resposta InfinitePay:', JSON.stringify(data, null, 2));

    if (!response.ok) {
      throw new Error(data.message || data.error || `Erro InfinitePay: ${response.status}`);
    }

    // Pega o link de pagamento retornado
    const linkPagamento = data.url || data.payment_url || data.link;

    if (!linkPagamento) {
      throw new Error('InfinitePay não retornou um link de pagamento válido');
    }

    // Atualiza pedido no Firebase com os dados do InfinitePay
    await db.collection('pedidos').doc(pedidoId).update({
      infinitePayId: data.id,
      linkPagamento: linkPagamento,
      statusPagamento: 'aguardando',
      atualizadoEm: new Date().toISOString()
    });

    console.log('✅ Link de pagamento criado:', linkPagamento);

    return res.json({
      success: true,
      link: linkPagamento,
      paymentId: data.id
    });

  } catch (error) {
    console.error('❌ Erro ao criar pagamento:', error);
    return res.status(500).json({
      success: false,
      message: error.message,
      detalhes: error.stack
    });
  }
};