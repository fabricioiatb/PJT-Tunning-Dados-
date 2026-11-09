const { ObjectId } = require('mongodb');

class HttpError extends Error {
  constructor(status, message, detalhe) {
    super(message);
    this.status = status;
    this.detalhe = detalhe;
  }
}

const notFound = (what) => new HttpError(404, `${what} não encontrada`);

function toObjectId(id) {
  if (!ObjectId.isValid(id) || String(id).length !== 24) {
    throw new HttpError(400, 'id inválido (esperado ObjectId de 24 caracteres hexadecimais)');
  }
  return new ObjectId(id);
}

// Resume o erro 121 (DocumentValidationFailure) do MongoDB em algo legível.
function resumoValidacao(err) {
  const details = err.errInfo?.details?.schemaRulesNotSatisfied;
  if (!details) return undefined;
  const msgs = [];
  const campo = (path) => path.join('') || 'documento';
  const walk = (rules, path = []) => {
    for (const r of rules || []) {
      if (r.missingProperties) {
        msgs.push(`${campo(path)}: faltando ${r.missingProperties.join(', ')}`);
      } else if (r.propertiesNotSatisfied) {
        for (const p of r.propertiesNotSatisfied) {
          walk(p.details, [...path, path.length ? `.${p.propertyName}` : p.propertyName]);
        }
      } else if (r.itemIndex !== undefined) {
        walk(r.details, [...path, `[${r.itemIndex}]`]);
      } else if (r.details) {
        walk(r.details, path);
      } else if (r.operatorName) {
        msgs.push(`${campo(path)}: regra '${r.operatorName}' não satisfeita`);
      }
    }
  };
  walk(details);
  return msgs.length ? msgs : undefined;
}

function errorHandler(err, req, res, next) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ erro: err.message, ...(err.detalhe && { detalhe: err.detalhe }) });
  }
  if (err.code === 121) {
    return res.status(400).json({ erro: 'Documento não passou na validação do schema', detalhe: resumoValidacao(err) });
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ erro: 'JSON inválido' });
  }
  console.error(err);
  res.status(500).json({ erro: 'Erro interno do servidor' });
}

module.exports = { HttpError, notFound, toObjectId, errorHandler };
