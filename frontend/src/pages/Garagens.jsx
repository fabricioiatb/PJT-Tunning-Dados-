import { useState } from 'react';
import { api, brl, TIPOS, NOME_TIPO } from '../api';
import { Alerta, Badge, Campo, Card, TipoVeiculo, Vazio, useAcao } from '../ui';

// Campos do "núcleo" (validados pelo $jsonSchema). O resto é livre por garagem.
const NUCLEO = new Set(['_id', 'nome', 'ativa', 'endereco', 'vagas', 'tarifas', 'comodidades', 'criado_em', 'atualizado_em', 'total_vagas']);

function CardGaragem({ g, onAlterado }) {
  const acao = useAcao();
  const extras = Object.fromEntries(Object.entries(g).filter(([k]) => !NUCLEO.has(k)));
  const e = g.endereco || {};

  const agir = async (fn) => {
    const r = await acao.executar(fn);
    if (r !== undefined) onAlterado();
  };

  return (
    <Card
      className={`garagem-card ${g.ativa ? '' : 'inativa'}`}
      titulo={g.nome}
      acoes={g.ativa ? <Badge cor="verde">Ativa</Badge> : <Badge cor="vermelho">Inativa</Badge>}
    >
      <p className="suave" style={{ margin: '0 0 12px' }}>
        {[e.logradouro && `${e.logradouro}${e.numero ? `, ${e.numero}` : ''}`, e.bairro, `${e.cidade}/${e.uf}`]
          .filter(Boolean)
          .join(' · ')}
      </p>

      <table className="tarifas">
        <thead>
          <tr>
            <th>Tipo</th>
            <th className="num">Vagas</th>
            <th className="num">Toler.</th>
            <th className="num">1ª hora</th>
            <th className="num">Adic.</th>
            <th className="num">Diária</th>
          </tr>
        </thead>
        <tbody>
          {g.vagas.map((v) => {
            const t = g.tarifas.find((x) => x.tipo_veiculo === v.tipo) || {};
            return (
              <tr key={v.tipo}>
                <td>
                  <TipoVeiculo tipo={v.tipo} />
                </td>
                <td className="num">{v.total}</td>
                <td className="num">{t.tolerancia_minutos != null ? `${t.tolerancia_minutos}min` : '—'}</td>
                <td className="num">{t.primeira_hora != null ? brl(t.primeira_hora) : '—'}</td>
                <td className="num">{t.hora_adicional != null ? brl(t.hora_adicional) : '—'}</td>
                <td className="num">{t.diaria_maxima != null ? brl(t.diaria_maxima) : '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {g.comodidades?.length > 0 && (
        <div className="chips" style={{ marginTop: 12 }}>
          {g.comodidades.map((c) => (
            <span className="chip" key={c}>
              {c}
            </span>
          ))}
        </div>
      )}

      {Object.keys(extras).length > 0 && (
        <>
          <h3>Campos específicos desta garagem</h3>
          <pre className="extras">{JSON.stringify(extras, null, 2)}</pre>
        </>
      )}

      <Alerta onFechar={() => acao.setErro(null)}>{acao.erro}</Alerta>
      <div className="entre" style={{ marginTop: 14 }}>
        <small className="suave mono">{g._id}</small>
        <div className="card-acoes">
          <button className="btn btn-pequeno" disabled={acao.ocupado} onClick={() => agir(() => api.atualizarGaragem(g._id, { ativa: !g.ativa }))}>
            {g.ativa ? 'Desativar' : 'Ativar'}
          </button>
          <button
            className="btn btn-pequeno btn-perigo"
            disabled={acao.ocupado}
            onClick={() => confirm(`Excluir ${g.nome}?`) && agir(() => api.removerGaragem(g._id))}
          >
            Excluir
          </button>
        </div>
      </div>
    </Card>
  );
}

const tipoVazio = { usar: false, total: '', tolerancia_minutos: '15', primeira_hora: '', hora_adicional: '', diaria_maxima: '' };

function NovaGaragem({ onCriada, onCancelar }) {
  const [f, setF] = useState({ nome: '', logradouro: '', numero: '', bairro: '', cidade: '', uf: 'SP', lat: '', lng: '', comodidades: '', extras: '' });
  const [tipos, setTipos] = useState({ CARRO: { ...tipoVazio, usar: true }, MOTO: { ...tipoVazio }, UTILITARIO: { ...tipoVazio } });
  const { ocupado, erro, setErro, executar } = useAcao();
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const setTipo = (tipo, k, v) => setTipos({ ...tipos, [tipo]: { ...tipos[tipo], [k]: v } });

  const enviar = async (e) => {
    e.preventDefault();
    let extras = {};
    if (f.extras.trim()) {
      try {
        extras = JSON.parse(f.extras);
      } catch {
        return setErro('Campos extras: JSON inválido');
      }
    }
    const usados = TIPOS.filter((t) => tipos[t].usar);
    const num = (v) => (v === '' ? undefined : Number(v));
    const body = {
      ...extras,
      nome: f.nome,
      endereco: {
        logradouro: f.logradouro || undefined,
        numero: f.numero || undefined,
        bairro: f.bairro || undefined,
        cidade: f.cidade,
        uf: f.uf,
        ...(f.lat && f.lng && { localizacao: { lat: Number(f.lat), lng: Number(f.lng) } }),
      },
      vagas: usados.map((t) => ({ tipo: t, total: parseInt(tipos[t].total, 10) })),
      tarifas: usados.map((t) => ({
        tipo_veiculo: t,
        tolerancia_minutos: num(tipos[t].tolerancia_minutos),
        primeira_hora: num(tipos[t].primeira_hora),
        hora_adicional: num(tipos[t].hora_adicional),
        diaria_maxima: num(tipos[t].diaria_maxima),
      })),
      comodidades: f.comodidades.split(',').map((s) => s.trim()).filter(Boolean),
    };
    const r = await executar(() => api.criarGaragem(body));
    if (r) onCriada();
  };

  return (
    <Card titulo="Nova garagem">
      <form onSubmit={enviar}>
        <div className="linha">
          <Campo label="Nome">
            <input value={f.nome} onChange={set('nome')} required />
          </Campo>
          <Campo label="Cidade">
            <input value={f.cidade} onChange={set('cidade')} required />
          </Campo>
          <div className="fixo" style={{ width: 80 }}>
            <Campo label="UF">
              <input value={f.uf} onChange={set('uf')} maxLength={2} required />
            </Campo>
          </div>
        </div>
        <div className="linha">
          <Campo label="Logradouro">
            <input value={f.logradouro} onChange={set('logradouro')} />
          </Campo>
          <div className="fixo" style={{ width: 100 }}>
            <Campo label="Número">
              <input value={f.numero} onChange={set('numero')} />
            </Campo>
          </div>
          <Campo label="Bairro">
            <input value={f.bairro} onChange={set('bairro')} />
          </Campo>
          <Campo label="Latitude">
            <input value={f.lat} onChange={set('lat')} placeholder="-23.56" />
          </Campo>
          <Campo label="Longitude">
            <input value={f.lng} onChange={set('lng')} placeholder="-46.65" />
          </Campo>
        </div>

        {TIPOS.map((t) => (
          <fieldset className="form-tipo" key={t}>
            <legend>
              <label>
                <input type="checkbox" style={{ width: 'auto', marginRight: 6 }} checked={tipos[t].usar} onChange={(e) => setTipo(t, 'usar', e.target.checked)} />
                {NOME_TIPO[t]}
              </label>
            </legend>
            {tipos[t].usar && (
              <div className="linha">
                {[
                  ['total', 'Vagas'],
                  ['tolerancia_minutos', 'Tolerância (min)'],
                  ['primeira_hora', '1ª hora (R$)'],
                  ['hora_adicional', 'Hora adic. (R$)'],
                  ['diaria_maxima', 'Diária máx. (R$)'],
                ].map(([k, label]) => (
                  <Campo key={k} label={label}>
                    <input type="number" min="0" step={k === 'total' || k === 'tolerancia_minutos' ? 1 : 0.01} value={tipos[t][k]} onChange={(e) => setTipo(t, k, e.target.value)} required={k !== 'diaria_maxima'} />
                  </Campo>
                ))}
              </div>
            )}
          </fieldset>
        ))}

        <Campo label="Comodidades" dica="Separadas por vírgula (ex.: coberta, lava-rapido, carregador-eletrico)">
          <input value={f.comodidades} onChange={set('comodidades')} />
        </Campo>
        <Campo label="Campos extras (JSON livre)" dica='Schema flexível: qualquer campo adicional é aceito, ex.: {"vista_mar": true, "convenios": [{"empresa": "X", "desconto_percentual": 10}]}'>
          <textarea value={f.extras} onChange={set('extras')} placeholder="{ }" />
        </Campo>

        <Alerta onFechar={() => setErro(null)}>{erro}</Alerta>
        <div className="linha">
          <button type="button" className="btn" onClick={onCancelar}>
            Cancelar
          </button>
          <button className="btn btn-primaria" disabled={ocupado}>
            Salvar garagem
          </button>
        </div>
      </form>
    </Card>
  );
}

export default function Garagens({ garagens, erroGaragens, recarregarGaragens }) {
  const [nova, setNova] = useState(false);
  const [filtro, setFiltro] = useState('');

  const cidades = [...new Set(garagens.map((g) => g.endereco?.cidade))].sort();
  const lista = garagens.filter((g) => !filtro || g.endereco?.cidade === filtro);

  return (
    <div className="pilha">
      <div className="entre">
        <div className="linha" style={{ flex: 1, maxWidth: 360 }}>
          <select value={filtro} onChange={(e) => setFiltro(e.target.value)}>
            <option value="">Todas as cidades ({garagens.length})</option>
            {cidades.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        {!nova && (
          <button className="btn btn-primaria" onClick={() => setNova(true)}>
            + Nova garagem
          </button>
        )}
      </div>

      <Alerta>{erroGaragens}</Alerta>

      {nova && (
        <NovaGaragem
          onCancelar={() => setNova(false)}
          onCriada={() => {
            setNova(false);
            recarregarGaragens();
          }}
        />
      )}

      {lista.length === 0 && !erroGaragens ? (
        <Card>
          <Vazio>Nenhuma garagem. Rode <code>npm run seed</code> no garagens-service.</Vazio>
        </Card>
      ) : (
        <div className="grade grade-cards">
          {lista.map((g) => (
            <CardGaragem key={g._id} g={g} onAlterado={recarregarGaragens} />
          ))}
        </div>
      )}
    </div>
  );
}
