const mercadopago = require('mercadopago');
const admin = require('firebase-admin');
const { Resend } = require('resend');

// =================== FIREBASE ===================
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

// =================== MERCADO PAGO ===================
mercadopago.configure({
  access_token: process.env.MP_ACCESS_TOKEN
});

// =================== RESEND ===================
const resend = new Resend(process.env.RESEND_API_KEY);

// =================== ENVIO DE E-MAILS ===================
async function enviarEmailsPagamentoAprovado(pedido, pedidoId) {
  console.log('📧 Iniciando envio de e-mails via Resend...');

  const dataFormatada = new Date(pedido.criadoEm).toLocaleDateString('pt-BR', {
    day: '2-digit', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });

  const numeroPedido = pedidoId.substring(0, 8).toUpperCase();

  const produtosHTML = pedido.itens.map(item => `
    <tr>
      <td style="padding: 10px 12px; border-bottom: 1px solid #f0f0f0;">${item.nome}</td>
      <td style="padding: 10px 12px; border-bottom: 1px solid #f0f0f0; text-align: center;">${item.quantidade || 1}</td>
      <td style="padding: 10px 12px; border-bottom: 1px solid #f0f0f0; text-align: right; color: #b52d1e; font-weight: 600;">
        R$ ${(item.preco * (item.quantidade || 1)).toFixed(2)}
      </td>
    </tr>
  `).join('');

  // ── HTML E-MAIL CLIENTE ──
  const htmlCliente = `
<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f8f3f3;font-family:'Raleway',Arial,sans-serif;">
  <div style="max-width:600px;margin:40px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.08);">
    <div style="background:#b52d1e;padding:30px 40px;text-align:center;">
      <h1 style="color:#fff;margin:0;font-size:26px;font-weight:700;">LofStore</h1>
      <p style="color:rgba(255,255,255,0.85);margin:8px 0 0;font-size:14px;">Perfumes exclusivos</p>
    </div>
    <div style="padding:40px;">
      <h2 style="color:#b52d1e;margin-top:0;">✅ Pagamento Confirmado!</h2>
      <p style="color:#444;font-size:15px;">Olá, <strong>${pedido.cliente.nome}</strong>!</p>
      <p style="color:#444;font-size:15px;">Seu pagamento foi aprovado e seu pedido já está sendo preparado.</p>

      <div style="background:#f9f9f9;border-radius:8px;padding:20px;margin:25px 0;">
        <p style="margin:0 0 5px;font-size:13px;color:#888;text-transform:uppercase;letter-spacing:1px;">Pedido</p>
        <p style="margin:0;font-size:20px;font-weight:700;color:#b52d1e;">#${numeroPedido}</p>
        <p style="margin:5px 0 0;font-size:13px;color:#666;">${dataFormatada}</p>
      </div>

      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        <thead>
          <tr style="background:#b52d1e;color:#fff;">
            <th style="padding:12px;text-align:left;">Produto</th>
            <th style="padding:12px;text-align:center;">Qtd</th>
            <th style="padding:12px;text-align:right;">Valor</th>
          </tr>
        </thead>
        <tbody>${produtosHTML}</tbody>
        <tfoot>
          <tr style="background:#f0f0f0;">
            <td colspan="2" style="padding:14px 12px;font-weight:700;font-size:15px;">TOTAL</td>
            <td style="padding:14px 12px;text-align:right;font-weight:700;font-size:18px;color:#b52d1e;">
              R$ ${parseFloat(pedido.total).toFixed(2)}
            </td>
          </tr>
        </tfoot>
      </table>

      <div style="margin:25px 0;padding:20px;border-left:4px solid #b52d1e;background:#fff9f8;border-radius:0 8px 8px 0;">
        <p style="margin:0 0 8px;font-weight:700;color:#333;">📦 Endereço de entrega</p>
        <p style="margin:0;color:#555;font-size:14px;">${pedido.cliente.endereco || 'Não informado'}</p>
        <p style="margin:5px 0 0;color:#555;font-size:14px;">Telefone: ${pedido.cliente.telefone}</p>
      </div>

      <p style="color:#555;font-size:14px;">Em caso de dúvidas, entre em contato conosco:</p>
      <div style="margin:15px 0;">
        <a href="https://wa.me/5511985242367" style="display:inline-block;background:#25D366;color:#fff;padding:10px 20px;border-radius:25px;text-decoration:none;font-weight:600;font-size:13px;margin-right:10px;">WhatsApp</a>
        <a href="https://www.instagram.com/lofstore_outlet/" style="display:inline-block;background:#E1306C;color:#fff;padding:10px 20px;border-radius:25px;text-decoration:none;font-weight:600;font-size:13px;">Instagram</a>
      </div>

      <a href="https://lofstore.com.br/perfil.html" style="display:block;text-align:center;background:#b52d1e;color:#fff;padding:14px;border-radius:30px;text-decoration:none;font-weight:700;margin-top:30px;">
        Ver Meus Pedidos
      </a>
    </div>
    <div style="background:#f8f3f3;padding:20px 40px;text-align:center;border-top:1px solid #eee;">
      <p style="margin:0;font-size:12px;color:#999;">© 2024 LofStore · Todos os direitos reservados</p>
    </div>
  </div>
</body>
</html>`;

  // ── HTML E-MAIL ADMIN ──
  const htmlAdmin = `
<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:20px;background:#f0f0f0;font-family:Arial,sans-serif;">
  <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:10px;overflow:hidden;">
    <div style="background:#333;padding:20px 30px;">
      <h2 style="color:#fff;margin:0;">🛒 Novo Pedido Aprovado — LofStore</h2>
    </div>
    <div style="padding:30px;">
      <p style="background:#d4edda;color:#155724;padding:12px 16px;border-radius:6px;font-weight:600;margin-top:0;">
        ✅ Pedido <strong>#${numeroPedido}</strong> — Pagamento APROVADO
      </p>

      <h3 style="color:#333;border-bottom:2px solid #eee;padding-bottom:8px;">👤 Dados do Cliente</h3>
      <table style="font-size:14px;color:#444;width:100%;border-collapse:collapse;">
        <tr><td style="padding:6px 0;width:130px;"><strong>Nome:</strong></td><td>${pedido.cliente.nome}</td></tr>
        <tr><td style="padding:6px 0;"><strong>E-mail:</strong></td><td>${pedido.cliente.email}</td></tr>
        <tr><td style="padding:6px 0;"><strong>Telefone:</strong></td><td>${pedido.cliente.telefone}</td></tr>
        <tr><td style="padding:6px 0;"><strong>Endereço:</strong></td><td>${pedido.cliente.endereco || 'Não informado'}</td></tr>
      </table>

      <h3 style="color:#333;border-bottom:2px solid #eee;padding-bottom:8px;margin-top:25px;">📦 Produtos</h3>
      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        <thead>
          <tr style="background:#b52d1e;color:#fff;">
            <th style="padding:10px;text-align:left;">Produto</th>
            <th style="padding:10px;text-align:center;">Qtd</th>
            <th style="padding:10px;text-align:right;">Valor</th>
          </tr>
        </thead>
        <tbody>${produtosHTML}</tbody>
        <tfoot>
          <tr style="background:#f8f8f8;font-weight:700;">
            <td colspan="2" style="padding:12px 10px;">TOTAL</td>
            <td style="padding:12px 10px;text-align:right;color:#b52d1e;font-size:16px;">R$ ${parseFloat(pedido.total).toFixed(2)}</td>
          </tr>
        </tfoot>
      </table>

      <div style="margin-top:25px;text-align:center;">
        <a href="https://lofstore.com.br/admin.html" style="display:inline-block;background:#b52d1e;color:#fff;padding:12px 28px;border-radius:25px;text-decoration:none;font-weight:700;">
          Ir para o Painel Admin
        </a>
      </div>
    </div>
  </div>
</body>
</html>`;

  let emailClienteOk = false;
  let emailAdminOk = false;

  // 1️⃣ E-mail para o CLIENTE
  try {
    console.log('📤 Enviando e-mail para cliente:', pedido.cliente.email);
    const { data, error } = await resend.emails.send({
      from: 'LofStore <onboarding@resend.dev>',
      to: pedido.cliente.email,
      subject: `✅ Pedido #${numeroPedido} confirmado — LofStore`,
      html: htmlCliente
    });

    if (error) throw new Error(error.message);
    console.log('✅ E-mail do CLIENTE enviado! ID:', data.id);
    emailClienteOk = true;
  } catch (erroCliente) {
    console.error('❌ ERRO ao enviar e-mail para CLIENTE:', erroCliente.message);
  }

  // 2️⃣ E-mail para o ADMIN
  try {
    const adminEmail = process.env.ADMIN_EMAIL || 'thafinhapassos@gmail.com';
    console.log('📤 Enviando e-mail para admin:', adminEmail);
    const { data, error } = await resend.emails.send({
      from: 'Sistema LofStore <onboarding@resend.dev>',
      to: adminEmail,
      subject: `🛒 Novo pedido aprovado #${numeroPedido}`,
      html: htmlAdmin
    });

    if (error) throw new Error(error.message);
    console.log('✅ E-mail do ADMIN enviado! ID:', data.id);
    emailAdminOk = true;
  } catch (erroAdmin) {
    console.error('❌ ERRO ao enviar e-mail para ADMIN:', erroAdmin.message);
  }

  console.log(`📊 Resultado: cliente=${emailClienteOk} | admin=${emailAdminOk}`);
  return { success: emailClienteOk || emailAdminOk, emailClienteOk, emailAdminOk };
}

// =================== WEBHOOK PRINCIPAL ===================
module.exports = async (req, res) => {
  console.log('📨 Webhook recebido do Mercado Pago');

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });

  try {
    const body = req.body || {};
    const { type, data } = body;

    console.log('Tipo:', type);
    console.log('Dados:', JSON.stringify(data));

    const pagamentoId = data?.id || req.query?.['data.id'];

    if (type !== 'payment' || !pagamentoId) {
      console.log('Notificação ignorada');
      return res.status(200).json({ success: true, message: 'Ignorado' });
    }

    console.log('Consultando pagamento:', pagamentoId);
    const pagamento = await mercadopago.payment.findById(pagamentoId);

    const pedidoId = pagamento.body.external_reference;
    const status = pagamento.body.status;

    console.log(`Pagamento ${pagamentoId} — status: ${status} — pedido: ${pedidoId}`);

    if (!pedidoId) {
      return res.status(200).json({ success: true, message: 'Sem pedidoId' });
    }

    const statusMap = {
      approved: 'pago',
      pending: 'pendente',
      in_process: 'pendente',
      rejected: 'cancelado',
      cancelled: 'cancelado'
    };
    const statusPedido = statusMap[status] || 'aguardando';

    const pedidoDoc = await db.collection('pedidos').doc(pedidoId).get();
    if (!pedidoDoc.exists) {
      return res.status(404).json({ error: 'Pedido não encontrado' });
    }

    const pedidoDados = pedidoDoc.data();

    await db.collection('pedidos').doc(pedidoId).update({
      statusPagamento: statusPedido,
      mercadoPagoStatus: status,
      pagamentoAtualizado: new Date().toISOString(),
      dadosPagamento: {
        id: pagamento.body.id,
        status,
        metodoPagamento: pagamento.body.payment_method_id,
        valorPago: pagamento.body.transaction_amount,
        dataAprovacao: pagamento.body.date_approved || null
      }
    });

    if (status === 'approved' && !pedidoDados.emailsEnviados) {
      const resultado = await enviarEmailsPagamentoAprovado(pedidoDados, pedidoId);

      await db.collection('pedidos').doc(pedidoId).update({
        emailsEnviados: resultado.emailClienteOk && resultado.emailAdminOk,
        emailClienteEnviado: resultado.emailClienteOk || false,
        emailAdminEnviado: resultado.emailAdminOk || false,
        dataEnvioEmails: new Date().toISOString()
      });
    }

    return res.status(200).json({ success: true });

  } catch (error) {
    console.error('❌ Erro no webhook:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
};