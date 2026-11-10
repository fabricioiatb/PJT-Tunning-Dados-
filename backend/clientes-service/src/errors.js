class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const notFound = (what) => new HttpError(404, `${what} não encontrado(a)`);

// Traduz erros do Postgres para respostas HTTP legíveis.
// https://www.postgresql.org/docs/current/errcodes-appendix.html
function errorHandler(err, req, res, next) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ erro: err.message });
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ erro: 'JSON inválido no corpo da requisição' });
  }

  switch (err.code) {
    case '23505': // unique_violation
      if (err.constraint === 'uq_plano_ativo_cliente_garagem') {
        return res.status(409).json({ erro: 'Cliente já possui um plano ativo nesta garagem' });
      }
      return res.status(409).json({ erro: `Registro duplicado (${err.constraint})`, detalhe: err.detail });
    case '23503': // foreign_key_violation
      return res
        .status(400)
        .json({ erro: 'Referência inválida (registro relacionado não existe)', detalhe: err.detail });
    case '23514': // check_violation
      return res.status(400).json({ erro: `Valor inválido (${err.constraint})` });
    case '23502': // not_null_violation
      return res.status(400).json({ erro: `Campo obrigatório ausente: ${err.column}` });
    case '22P02': // invalid_text_representation (ex.: id não numérico)
    case '22007': // invalid_datetime_format
    case '22008': // datetime_field_overflow
      return res.status(400).json({ erro: 'Formato de valor inválido' });
  }

  console.error(err);
  res.status(500).json({ erro: 'Erro interno do servidor' });
}

module.exports = { HttpError, notFound, errorHandler };
