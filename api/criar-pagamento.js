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
    console.log('📦 Body recebido:', JSON.stringify(req.body, null, 2));

    // Validações
    if (!pedidoId || !itens || !cliente) {
      return res.status(400).json({ success: false, message: 'Dados incompletos' });
    }

    if (!Array.isArray(itens) || itens.length === 0) {
      return res.status(400).json({ success: false, message: 'Carrinho vazio' });
    }

    // Handle: valor da variável INFINITEPAY_API_KEY na Vercel (ex: "lofstore")
    const handle = process.env.INFINITEPAY_API_KEY;

    if (!handle) {
      throw new Error('INFINITEPAY_API_KEY não configurada na Vercel');
    }

    console.log('🏷️ Handle InfinitePay:', handle);

    // =================== ITENS ===================
    // Garante que price é número inteiro em centavos e >= 1
    const itensMapeados = itens.map(item => {
      const quantidade = Math.max(1, parseInt(item.quantidade) || 1);
      const precoUnitario = parseFloat(item.preco) || 0;
      const precoEmCentavos = Math.round(precoUnitario * 100);

      if (precoEmCentavos < 1) {
        throw new Error(`Preço inválido para o item "${item.nome}": R$ ${precoUnitario}`);
      }

      return {
        quantity: quantidade,
        price: precoEmCentavos,
        description: String(item.nome).substring(0, 100) // máx 100 chars
      };
    });

    console.log('🛒 Itens mapeados:', JSON.stringify(itensMapeados, null, 2));

    // =================== TELEFONE ===================
    // Remove tudo que não for dígito e garante formato correto
    const telefoneLimpo = String(cliente.telefone || '')
      .replace(/\D/g, '')
      .replace(/^0/, ''); // remove zero à esquerda se houver

    // InfinitePay espera E.164: +55XXXXXXXXXXX (12 ou 13 dígitos com 55)
    let telefoneFormatado;
    if (telefoneLimpo.startsWith('55') && telefoneLimpo.length >= 12) {
      telefoneFormatado = `+${telefoneLimpo}`;
    } else if (telefoneLimpo.length === 11 || telefoneLimpo.length === 10) {
      telefoneFormatado = `+55${telefoneLimpo}`;
    } else {
      // Fallback: usa o que tem ou um número fictício para não quebrar
      telefoneFormatado = `+55${telefoneLimpo.padEnd(11, '0').substring(0, 11)}`;
    }

    console.log('📱 Telefone formatado:', telefoneFormatado);

    // =================== URLS ===================
    const frontendUrl = process.env.FRONTEND_URL || 'https://lofstore.com.br';
    const backendUrl = process.env.BACKEND_URL || 'https://lofstore-backend.vercel.app';

    // =================== PAYLOAD INFINITEPAY ===================
    const payload = {
      handle: handle,
      order_nsu: pedidoId,
      redirect_url: `${frontendUrl}/pagamento-sucesso.html?pedido=${pedidoId}`,
      webhook_url: `${backendUrl}/webhook`,
      items: itensMapeados,
      customer: {
        name: String(cliente.nome || 'Cliente').substring(0, 100),
        email: String(cliente.email || ''),
        phone_number: telefoneFormatado
      }
    };

    console.log('📤 Payload final para InfinitePay:', JSON.stringify(payload, null, 2));

    // =================== CHAMADA À API ===================
    const response = await fetch('https://api.infinitepay.io/invoices/public/checkout/links', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const responseText = await response.text();
    console.log('📥 Status HTTP InfinitePay:', response.status);
    console.log('📥 Resposta bruta InfinitePay:', responseText);

    if (!responseText || responseText.trim() === '') {
      throw new Error('InfinitePay retornou resposta vazia. Verifique sua InfiniteTag.');
    }

    let data;
    try {
      data = JSON.parse(responseText);
    } catch (parseError) {
      throw new Error(`Resposta inválida da InfinitePay: ${responseText}`);
    }

    console.log('📥 Resposta InfinitePay parsed:', JSON.stringify(data, null, 2));

    if (!response.ok) {
      throw new Error(data.message || data.error || `Erro HTTP ${response.status}: ${JSON.stringify(data)}`);
    }

    const linkPagamento = data.url || data.checkout_url || data.link;

    if (!linkPagamento) {
      throw new Error(`InfinitePay não retornou link. Resposta: ${JSON.stringify(data)}`);
    }

    // Atualiza pedido no Firebase
    await db.collection('pedidos').doc(pedidoId).update({
      infinitePayOrderNsu: pedidoId,
      infinitePaySlug: data.slug || data.invoice_slug || '',
      linkPagamento: linkPagamento,
      statusPagamento: 'aguardando',
      atualizadoEm: new Date().toISOString()
    });

    console.log('✅ Link de pagamento criado:', linkPagamento);

    return res.json({
      success: true,
      link: linkPagamento,
      orderNsu: pedidoId
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