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

    // InfiniteTag sem o $ (variável INFINITEPAY_API_KEY na Vercel)
    // Ex: se sua tag é $lofstore, o valor deve ser: lofstore
    const handle = process.env.INFINITEPAY_API_KEY;

    if (!handle) {
      throw new Error('INFINITEPAY_API_KEY não configurada na Vercel');
    }

    // Monta os itens no formato do InfinitePay (preço em centavos)
    const itensMapeados = itens.map(item => ({
      quantity: Number(item.quantidade || 1),
      price: Math.round(Number(item.preco) * 100), // InfinitePay usa centavos
      description: item.nome
    }));

    // order_nsu é o identificador do pedido no seu sistema
    // Usamos o pedidoId do Firebase para rastrear no webhook
    const orderNsu = pedidoId;

    // =================== PAYLOAD DA API INFINITEPAY ===================
    // Documentação: https://ajuda.infinitepay.io/pt-BR/articles/10766888
    const payload = {
      handle: handle,        // sua InfiniteTag sem o $
      order_nsu: orderNsu,   // ID do pedido — retorna no webhook
      redirect_url: `${process.env.FRONTEND_URL}/pagamento-sucesso.html?pedido=${pedidoId}`,
      webhook_url: `${process.env.BACKEND_URL}/webhook`,
      items: itensMapeados,
      customer: {
        name: cliente.nome,
        email: cliente.email,
        phone_number: `+55${String(cliente.telefone || '').replace(/\D/g, '')}`
      }
    };

    console.log('📤 Enviando para InfinitePay:', JSON.stringify(payload, null, 2));

    // API pública do InfinitePay — não precisa de token de autorização
    const response = await fetch('https://api.infinitepay.io/invoices/public/checkout/links', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    // Lê como texto primeiro para evitar crash em resposta vazia
    const responseText = await response.text();
    console.log('📥 Resposta bruta InfinitePay:', responseText);

    if (!responseText || responseText.trim() === '') {
      throw new Error('InfinitePay retornou resposta vazia. Verifique sua InfiniteTag.');
    }

    const data = JSON.parse(responseText);
    console.log('📥 Resposta InfinitePay parsed:', JSON.stringify(data, null, 2));

    if (!response.ok) {
      throw new Error(data.message || data.error || `Erro HTTP ${response.status}: ${JSON.stringify(data)}`);
    }

    // InfinitePay retorna o link no campo "url"
    const linkPagamento = data.url || data.checkout_url || data.link;

    if (!linkPagamento) {
      throw new Error(`InfinitePay não retornou link. Resposta completa: ${JSON.stringify(data)}`);
    }

    // Atualiza pedido no Firebase com dados do InfinitePay
    await db.collection('pedidos').doc(pedidoId).update({
      infinitePayOrderNsu: orderNsu,
      infinitePaySlug: data.slug || data.invoice_slug || '',
      linkPagamento: linkPagamento,
      statusPagamento: 'aguardando',
      atualizadoEm: new Date().toISOString()
    });

    console.log('✅ Link de pagamento criado:', linkPagamento);

    return res.json({
      success: true,
      link: linkPagamento,
      orderNsu: orderNsu
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