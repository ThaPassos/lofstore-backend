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

async function enviarEmailsPagamentoAprovado(pedido, pedidoId) {
  try {
    console.log('Preparando envio de emails via EmailJS...');
    
    const dataFormatada = new Date(pedido.criadoEm).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    // Formata lista de produtos para o email
    const produtosTexto = pedido.itens.map(item => 
      `${item.nome} (x${item.quantidade || 1}) - R$ ${(item.preco * (item.quantidade || 1)).toFixed(2)}`
    ).join('\n');

    const produtosHTML = pedido.itens.map(item => `
      <tr style="border-bottom: 1px solid #eee;">
        <td style="padding: 12px;">${item.nome}</td>
        <td style="padding: 12px; text-align: center;">${item.quantidade || 1}</td>
        <td style="padding: 12px; text-align: right; color: #b52d1e; font-weight: 600;">R$ ${(item.preco * (item.quantidade || 1)).toFixed(2)}</td>
      </tr>
    `).join('');

    const dadosEmailCliente = {
      to_email: pedido.cliente.email,
      to_name: pedido.cliente.nome,
      from_name: 'LofStore',
      reply_to: 'thafinhapassos@gmail.com',
      
      // Dados do pedido
      pedido_numero: `#${pedidoId.substring(0, 8)}`,
      pedido_id_completo: pedidoId,
      pedido_data: dataFormatada,
      pedido_status: 'PAGO',
      pedido_total: `R$ ${pedido.total.toFixed(2)}`,
      
      // Produtos (versão texto para fallback)
      produtos_texto: produtosTexto,
      
      // Produtos (versão HTML)
      produtos_html: `
        <table style="width: 100%; background: #f9f9f9; border-radius: 10px; overflow: hidden; border-collapse: collapse;">
          <thead>
            <tr style="background: #b52d1e; color: white;">
              <th style="padding: 12px; text-align: left;">Produto</th>
              <th style="padding: 12px; text-align: center;">Qtd</th>
              <th style="padding: 12px; text-align: right;">Valor</th>
            </tr>
          </thead>
          <tbody>
            ${produtosHTML}
          </tbody>
          <tfoot>
            <tr>
              <td colspan="2" style="padding: 15px; text-align: right; font-weight: 700;">TOTAL:</td>
              <td style="padding: 15px; text-align: right; font-size: 20px; font-weight: 700; color: #b52d1e;">R$ ${pedido.total.toFixed(2)}</td>
            </tr>
          </tfoot>
        </table>
      `,
      
      // Endereço de entrega
      cliente_nome: pedido.cliente.nome,
      cliente_endereco: pedido.cliente.endereco,
      cliente_telefone: pedido.cliente.telefone,
      
      // Links
      link_pedidos: 'https://lofstore.com.br/perfil.html',
      link_whatsapp: 'https://wa.me/5511985242367',
      link_instagram: 'https://www.instagram.com/lofstore_outlet/'
    };

    const dadosEmailAdmin = {
      to_email: 'thafinhapassos@gmail.com', 
      to_name: 'Admin LofStore',
      from_name: 'Sistema LofStore',
      reply_to: pedido.cliente.email, 
      
      // Tipo de notificação
      tipo_notificacao: 'NOVO PAGAMENTO APROVADO',
      
      // Dados do pedido
      pedido_numero: `#${pedidoId.substring(0, 8)}`,
      pedido_id_completo: pedidoId,
      pedido_data: dataFormatada,
      pedido_total: `R$ ${pedido.total.toFixed(2)}`,
      pedido_status: 'PAGO',
      
      // Dados do cliente
      cliente_nome: pedido.cliente.nome,
      cliente_email: pedido.cliente.email,
      cliente_telefone: pedido.cliente.telefone,
      cliente_endereco: pedido.cliente.endereco,
      
      // Produtos (versão texto)
      produtos_texto: produtosTexto,
      
      // Produtos (versão HTML)
      produtos_html: `
        <table style="width: 100%; background: #f9f9f9; border-radius: 10px; overflow: hidden; border-collapse: collapse;">
          <thead>
            <tr style="background: #b52d1e; color: white;">
              <th style="padding: 12px; text-align: left;">Produto</th>
              <th style="padding: 12px; text-align: center;">Qtd</th>
              <th style="padding: 12px; text-align: right;">Valor</th>
            </tr>
          </thead>
          <tbody>
            ${produtosHTML}
          </tbody>
        </table>
      `,
      
      // Links para admin
      link_admin: 'https://lofstore.com.br/admin.html',
      link_cliente_whatsapp: `https://wa.me/55${pedido.cliente.telefone.replace(/\D/g, '')}`,
      
      // Ação necessária
      acao_necessaria: 'Prepare o pedido para envio e atualize o status!'
    };

    
    const EMAILJS_SERVICE_ID = process.env.EMAILJS_SERVICE_ID || 'service_k85ya1a';
    const EMAILJS_TEMPLATE_CLIENTE = process.env.EMAILJS_TEMPLATE_CLIENTE || 'template_jjxc4sr';
    const EMAILJS_TEMPLATE_ADMIN = process.env.EMAILJS_TEMPLATE_ADMIN || 'template_cfcay9o';
    const EMAILJS_PUBLIC_KEY = process.env.EMAILJS_PUBLIC_KEY;

    // Email para o Cliente
    const responseCliente = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        service_id: EMAILJS_SERVICE_ID,
        template_id: EMAILJS_TEMPLATE_CLIENTE,
        user_id: EMAILJS_PUBLIC_KEY,
        template_params: dadosEmailCliente
      })
    });

    if (!responseCliente.ok) {
      const errorText = await responseCliente.text();
      throw new Error(`Erro ao enviar email para cliente: ${errorText}`);
    }

    console.log('Email enviado para o cliente:', pedido.cliente.email);

    // Email para o Admin
    const responseAdmin = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        service_id: EMAILJS_SERVICE_ID,
        template_id: EMAILJS_TEMPLATE_ADMIN,
        user_id: EMAILJS_PUBLIC_KEY,
        template_params: dadosEmailAdmin
      })
    });

    if (!responseAdmin.ok) {
      const errorText = await responseAdmin.text();
      throw new Error(`Erro ao enviar email para admin: ${errorText}`);
    }

    console.log('Email enviado para o admin: thafinhapassos@gmail.com');

    return { success: true, message: 'Emails enviados com sucesso!' };

  } catch (error) {
    console.error('Erro ao enviar emails:', error);
    return { success: false, message: error.message };
  }
}

// =================== WEBHOOK PRINCIPAL ===================
module.exports = async (req, res) => {
  console.log('📨 Webhook recebido do Mercado Pago');

  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  try {
    const { type, data } = req.body;

    console.log('Tipo de notificação:', type);
    console.log('Dados:', JSON.stringify(data, null, 2));

    if (type === 'payment') {
      const pagamentoId = data.id;
      
      console.log('Consultando pagamento no Mercado Pago:', pagamentoId);
      const pagamento = await mercadopago.payment.findById(pagamentoId);
      
      const pedidoId = pagamento.body.external_reference;
      const status = pagamento.body.status;

      console.log(`Pagamento ${pagamentoId} - Status: ${status} - Pedido: ${pedidoId}`);

      // Define status do pedido
      let statusPedido;
      switch (status) {
        case 'approved': 
          statusPedido = 'pago'; 
          break;
        case 'pending':
        case 'in_process': 
          statusPedido = 'pendente'; 
          break;
        case 'rejected':
        case 'cancelled': 
          statusPedido = 'cancelado'; 
          break;
        default: 
          statusPedido = 'aguardando';
      }

      const pedidoDoc = await db.collection('pedidos').doc(pedidoId).get();
      
      if (!pedidoDoc.exists) {
        console.error('Pedido não encontrado:', pedidoId);
        return res.status(404).json({ error: 'Pedido não encontrado' });
      }

      const pedidoDados = pedidoDoc.data();

      await db.collection('pedidos').doc(pedidoId).update({
        statusPagamento: statusPedido,
        mercadoPagoStatus: status,
        pagamentoAtualizado: new Date().toISOString(),
        dadosPagamento: {
          id: pagamento.body.id,
          status: status,
          metodoPagamento: pagamento.body.payment_method_id,
          valorPago: pagamento.body.transaction_amount,
          dataAprovacao: pagamento.body.date_approved || null
        }
      });

      console.log(`Pedido ${pedidoId} atualizado no Firebase: ${statusPedido}`);

      if (status === 'approved') {
        console.log('Pagamento APROVADO! Enviando notificações por email...');
        
        const resultadoEmail = await enviarEmailsPagamentoAprovado(pedidoDados, pedidoId);
        
        if (resultadoEmail.success) {
          console.log('Emails enviados com sucesso!');
          
          // Registra envio no Firebase
          await db.collection('pedidos').doc(pedidoId).update({
            emailsEnviados: true,
            dataEnvioEmails: new Date().toISOString()
          });
        } else {
          console.error('Erro ao enviar emails:', resultadoEmail.message);
        }
      } else {
        console.log(`Status "${status}" - Emails não enviados (apenas em "approved")`);
      }
    }

    res.status(200).json({ success: true, message: 'Webhook processado' });

  } catch (error) {
    console.error('Erro no webhook:', error);
    console.error('Stack:', error.stack);
    res.status(500).json({ 
      success: false, 
      error: error.message,
      stack: error.stack 
    });
  }
};