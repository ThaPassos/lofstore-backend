const admin = require('firebase-admin');
const nodemailer = require('nodemailer');

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

// =================== NODEMAILER (GMAIL) ===================
function criarTransporter() {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_PASS
    }
  });
}

// =================== ENVIO DE E-MAILS ===================
async function enviarEmailsPagamentoAprovado(pedido, pedidoId) {
  console.log('📧 Iniciando envio de e-mails via Gmail/Nodemailer...');

  const transporter = criarTransporter();

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
        ✅ Pedido <strong>#${numeroPedido}</strong> — Pagamento APROVADO via InfinitePay
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

  try {
    console.log('📤 Enviando e-mail para cliente:', pedido.cliente.email);
    await transporter.sendMail({
      from: `"LofStore" <${process.env.GMAIL_USER}>`,
      to: pedido.cliente.email,
      subject: `✅ Pedido #${numeroPedido} confirmado — LofStore`,
      html: htmlCliente
    });
    console.log('✅ E-mail do CLIENTE enviado!');
    emailClienteOk = true;
  } catch (erroCliente) {
    console.error('❌ ERRO ao enviar e-mail para CLIENTE:', erroCliente.message);
  }

  try {
    const adminEmail = process.env.ADMIN_EMAIL || process.env.GMAIL_USER;
    console.log('📤 Enviando e-mail para admin:', adminEmail);
    await transporter.sendMail({
      from: `"Sistema LofStore" <${process.env.GMAIL_USER}>`,
      to: adminEmail,
      subject: `🛒 Novo pedido aprovado #${numeroPedido}`,
      html: htmlAdmin
    });
    console.log('✅ E-mail do ADMIN enviado!');
    emailAdminOk = true;
  } catch (erroAdmin) {
    console.error('❌ ERRO ao enviar e-mail para ADMIN:', erroAdmin.message);
  }

  console.log(`📊 Resultado: cliente=${emailClienteOk} | admin=${emailAdminOk}`);
  return { success: emailClienteOk || emailAdminOk, emailClienteOk, emailAdminOk };
}

// =================== WEBHOOK PRINCIPAL ===================
module.exports = async (req, res) => {
  console.log('📨 Webhook recebido do InfinitePay');

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });

  try {
    const body = req.body || {};

    console.log('📥 Body do webhook InfinitePay:', JSON.stringify(body, null, 2));

    // =================== INTERPRETAÇÃO DO WEBHOOK INFINITEPAY ===================
    // O InfinitePay envia o evento no campo "event" ou "type"
    // e os dados do pagamento no campo "data" ou "payment"
    const evento = body.event || body.type || '';
    const dadosPagamento = body.data || body.payment || body;

    // O pedidoId foi salvo como external_reference na criação do link
    const pedidoId = dadosPagamento.external_reference
      || dadosPagamento.order_id
      || dadosPagamento.metadata?.pedido_id
      || null;

    // Status do pagamento vindo do InfinitePay
    const statusInfinitePay = dadosPagamento.status || dadosPagamento.payment_status || '';

    console.log(`📌 Evento: ${evento} | Status: ${statusInfinitePay} | Pedido: ${pedidoId}`);

    // Ignora eventos que não são de pagamento
    if (!pedidoId) {
      console.log('⚠️ Webhook sem pedidoId — ignorado');
      return res.status(200).json({ success: true, message: 'Ignorado — sem pedidoId' });
    }

    // Mapeia status do InfinitePay para status interno do sistema
    // Referência: https://developers.infinitepay.io/docs/webhooks
    const statusMap = {
      // Status de aprovação
      'approved': 'pago',
      'paid': 'pago',
      'captured': 'pago',
      'succeeded': 'pago',
      // Status de pendência
      'pending': 'pendente',
      'waiting_payment': 'pendente',
      'processing': 'pendente',
      'in_process': 'pendente',
      // Status de falha/cancelamento
      'failed': 'cancelado',
      'cancelled': 'cancelado',
      'canceled': 'cancelado',
      'rejected': 'cancelado',
      'expired': 'cancelado',
      'refunded': 'cancelado'
    };

    const statusPedido = statusMap[statusInfinitePay.toLowerCase()] || 'aguardando';

    // Busca o pedido no Firebase
    const pedidoDoc = await db.collection('pedidos').doc(pedidoId).get();
    if (!pedidoDoc.exists) {
      console.error('❌ Pedido não encontrado no Firebase:', pedidoId);
      return res.status(404).json({ error: 'Pedido não encontrado' });
    }

    const pedidoDados = pedidoDoc.data();

    // Atualiza o pedido no Firebase
    await db.collection('pedidos').doc(pedidoId).update({
      statusPagamento: statusPedido,
      infinitePayStatus: statusInfinitePay,
      pagamentoAtualizado: new Date().toISOString(),
      dadosPagamento: {
        id: dadosPagamento.id || '',
        status: statusInfinitePay,
        metodoPagamento: dadosPagamento.payment_method || dadosPagamento.method || '',
        valorPago: dadosPagamento.amount ? dadosPagamento.amount / 100 : pedidoDados.total,
        dataAprovacao: dadosPagamento.paid_at || dadosPagamento.captured_at || null
      }
    });

    console.log(`✅ Pedido ${pedidoId} atualizado para: ${statusPedido}`);

    // Envia e-mails apenas quando pagamento for aprovado e ainda não enviou
    if (statusPedido === 'pago' && !pedidoDados.emailsEnviados) {
      console.log('💌 Pagamento aprovado — enviando e-mails...');
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
    // Retorna 200 mesmo com erro para o InfinitePay não ficar reenviando
    return res.status(200).json({ success: false, error: error.message });
  }
};