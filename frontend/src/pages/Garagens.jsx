import { useState } from 'react';
import { api, brl, TIPOS, NOME_TIPO } from '../api';
import {
  Alerta, Badge, BotaoEnviar, CabecalhoPagina, Campo, Card, TipoVeiculo, Vazio, useAcao, useAvisoSaida, useConfirmar,
} from '../ui';
import { useParamUrl } from '../url';

// Campos do "núcleo" (validados pelo $jsonSchema). O resto é livre por garagem.
const NUCLEO = new Set(['_id', 'nome', 'ativa', 'endereco', 'vagas', 'tarifas', 'comodidades', 'criado_em', 'atualizado_em', 'total_vagas']);

function CardGaragem({ g, onAlterado, confirmar }) {
  const acao = useAcao();
  const extras = Object.fromEntries(Object.entries(g).filter(([k]) => !NUCLEO.has(k)));
  const e = g.endereco || {};

  const agir = async (fn) => {
    const r = await acao.executar(fn);
    if (r !== undefined) onAlterado();
  };

  return (
    <Card
      id={`g-${g._id}`}
      className={`garagem-card ${g.ativa ? '' : 'inativa'}`}
      titulo={g.nome}
      acoes={g.ativa ? <Badge cor="verde">Ativa</Badge> : <Badge cor="vermelho">Inativa</Badge>}
    >
      <p className="suave" style={{ margin: '0 0 14px', overflowWrap: 'anywhere' }}>
        {[e.logradouro && `${e.logradouro}${e.numero ? `, ${e.numero}` : ''}`, e.bairro, `${e.cidade}/${e.uf}`]
          .filter(Boolean)
          .join(' · ')}
      </p>

      <div className="tabela-wrap">
        <table className="tarifas">
          <caption className="sr-only">Vagas e tarifas por tipo de veículo</caption>
          <thead>
            <tr>
              <th scope="col">Tipo</th>
              <th scope="col" className="num">Vagas</th>
              <th scope="col" className="num">Toler.</th>
              <th scope="col" className="num">1ª hora</th>
              <th scope="col" className="num">Adic.</th>
              <th scope="col" className="num">Diária</th>
            </tr>
          </thead>
          <tbody>
            {g.vagas.map((v) => {
              const t = g.tarifas.find((x) => x.tipo_veiculo === v.tipo) || {};
              return (
                <tr key={v.tipo}>
                  <th scope="row" style={{ textTransform: 'none', letterSpacing: 0, border: 0, padding: 6 }}>
                    <TipoVeiculo tipo={v.tipo} />
                  </th>
                  <td className="num">{v.total}</td>
                  <td className="num">{t.tolerancia_minutos != null ? `${t.tolerancia_minutos} min` : '—'}</td>
                  <td className="num">{t.primeira_hora != null ? brl(t.primeira_hora) : '—'}</td>
                  <td className="num">{t.hora_adicional != null ? brl(t.hora_adicional) : '—'}</td>
                  <td className="num">{t.diaria_maxima != null ? brl(t.diaria_maxima) : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {g.comodidades?.length > 0 && (
        <ul className="chips" style={{ marginTop: 14, padding: 0, listStyle: 'none' }} aria-label="Comodidades">
          {g.comodidades.map((c) => (
            <li className="chip" key={c}>
              {c}
            </li>
          ))}
        </ul>
      )}

      {Object.keys(extras).length > 0 && (
        <>
          <h3>Campos específicos desta garagem</h3>
          <pre className="extras" translate="no" tabIndex={0} aria-label="Campos específicos em JSON">
            {JSON.stringify(extras, null, 2)}
          </pre>
        </>
      )}

      <Alerta focar onFechar={() => acao.setErro(null)}>
        {acao.erro}
      </Alerta>
      <div className="entre" style={{ marginTop: 16 }}>
        <small className="suave mono truncar" translate="no" title={g._id}>
          {g._id}
        </small>
        <div className="card-acoes">
          <button
            type="button"
            className="btn btn-pequeno"
            disabled={acao.ocupado}
            onClick={async () => {
              if (g.ativa) {
                const ok = await confirmar({
                  titulo: `Desativar ${g.nome}?`,
                  texto: 'A garagem deixa de aceitar check-ins e novos planos. Os dados são mantidos e você pode reativá-la depois.',
                  acao: 'Desativar garagem',
                });
                if (!ok) return;
              }
              agir(() => api.atualizarGaragem(g._id, { ativa: !g.ativa }));
            }}
          >
            {g.ativa ? 'Desativar' : 'Reativar'}
          </button>
          <button
            type="button"
            className="btn btn-pequeno btn-perigo"
            disabled={acao.ocupado}
            onClick={async () => {
              const ok = await confirmar({
                titulo: `Excluir ${g.nome}?`,
                texto: 'O documento é removido do MongoDB e não pode ser recuperado. Para apenas parar a operação, prefira desativar.',
                acao: 'Excluir garagem',
              });
              if (ok) agir(() => api.removerGaragem(g._id));
            }}
          >
            Excluir
          </button>
        </div>
      </div>
    </Card>
  );
}

const tipoVazio = { usar: false, total: '', tolerancia_minutos: '15', primeira_hora: '', hora_adicional: '', diaria_maxima: '' };
const formVazio = { nome: '', logradouro: '', numero: '', bairro: '', cidade: '', uf: 'SP', lat: '', lng: '', comodidades: '', extras: '' };

const CAMPOS_TARIFA = [
  ['total', 'Vagas', 'numeric', 1, '50'],
  ['tolerancia_minutos', 'Tolerância (min)', 'numeric', 1, '15'],
  ['primeira_hora', '1ª hora (R$)', 'decimal', 0.01, '15'],
  ['hora_adicional', 'Hora adicional (R$)', 'decimal', 0.01, '6'],
  ['diaria_maxima', 'Diária máx. (R$)', 'decimal', 0.01, '50'],
];

function NovaGaragem({ onCriada, onCancelar }) {
  const [f, setF] = useState(formVazio);
  const [tipos, setTipos] = useState({ CARRO: { ...tipoVazio, usar: true }, MOTO: { ...tipoVazio }, UTILITARIO: { ...tipoVazio } });
  const { ocupado, erro, setErro, executar } = useAcao();
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const setTipo = (tipo, k, v) => setTipos({ ...tipos, [tipo]: { ...tipos[tipo], [k]: v } });
  useAvisoSaida(Object.keys(f).some((k) => f[k] !== formVazio[k]));

  const enviar = async (e) => {
    e.preventDefault();
    let extras = {};
    if (f.extras.trim()) {
      try {
        extras = JSON.parse(f.extras);
      } catch {
        return setErro('Campos extras: o JSON está inválido. Confira aspas e vírgulas, ex.: {"vista_mar": true}.');
      }
    }
    const usados = TIPOS.filter((t) => tipos[t].usar);
    if (!usados.length) return setErro('Marque pelo menos um tipo de veículo e informe vagas e tarifa.');
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
    <Card titulo="Nova garagem" id="nova-garagem">
      <form onSubmit={enviar}>
        <div className="linha">
          <Campo label="Nome">
            <input name="nome" value={f.nome} onChange={set('nome')} autoComplete="off" placeholder="ex.: Garagem Centro…" required />
          </Campo>
          <Campo label="Cidade">
            <input name="cidade" value={f.cidade} onChange={set('cidade')} autoComplete="off" placeholder="ex.: São Paulo…" required />
          </Campo>
          <div className="fixo" style={{ width: 90 }}>
            <Campo label="UF">
              <input name="uf" value={f.uf} onChange={set('uf')} maxLength={2} autoComplete="off" spellCheck={false} required />
            </Campo>
          </div>
        </div>
        <div className="linha">
          <Campo label="Logradouro">
            <input name="logradouro" value={f.logradouro} onChange={set('logradouro')} autoComplete="off" placeholder="ex.: Av. Paulista…" />
          </Campo>
          <div className="fixo" style={{ width: 110 }}>
            <Campo label="Número">
              <input name="numero" value={f.numero} onChange={set('numero')} autoComplete="off" inputMode="numeric" />
            </Campo>
          </div>
          <Campo label="Bairro">
            <input name="bairro" value={f.bairro} onChange={set('bairro')} autoComplete="off" />
          </Campo>
        </div>
        <div className="linha">
          <Campo label="Latitude" dica="Opcional; habilita a busca por proximidade.">
            <input name="lat" value={f.lat} onChange={set('lat')} inputMode="decimal" autoComplete="off" spellCheck={false} placeholder="ex.: -23.56…" />
          </Campo>
          <Campo label="Longitude">
            <input name="lng" value={f.lng} onChange={set('lng')} inputMode="decimal" autoComplete="off" spellCheck={false} placeholder="ex.: -46.65…" />
          </Campo>
        </div>

        {TIPOS.map((t) => (
          <fieldset className="form-tipo" key={t}>
            <legend>
              <label className="checkbox">
                <input type="checkbox" name={`usar-${t}`} checked={tipos[t].usar} onChange={(e) => setTipo(t, 'usar', e.target.checked)} />
                Aceita {NOME_TIPO[t].toLowerCase()}
              </label>
            </legend>
            {tipos[t].usar && (
              <div className="linha">
                {CAMPOS_TARIFA.map(([k, label, modo, passo, ex]) => (
                  <Campo key={k} label={label}>
                    <input
                      type="number"
                      name={`${t}-${k}`}
                      inputMode={modo}
                      min="0"
                      step={passo}
                      value={tipos[t][k]}
                      onChange={(e) => setTipo(t, k, e.target.value)}
                      placeholder={`ex.: ${ex}…`}
                      autoComplete="off"
                      required={k !== 'diaria_maxima'}
                    />
                  </Campo>
                ))}
              </div>
            )}
          </fieldset>
        ))}

        <Campo label="Comodidades" dica="Separadas por vírgula.">
          <input name="comodidades" value={f.comodidades} onChange={set('comodidades')} autoComplete="off" placeholder="ex.: coberta, lava-rapido…" />
        </Campo>
        <Campo
          label="Campos extras (JSON livre)"
          dica="Schema flexível: qualquer campo adicional é aceito e aparece no cartão da garagem."
        >
          <textarea name="extras" value={f.extras} onChange={set('extras')} spellCheck={false} translate="no" placeholder='ex.: {"vista_mar": true}…' />
        </Campo>

        <Alerta focar onFechar={() => setErro(null)}>
          {erro}
        </Alerta>
        <div className="linha">
          <button type="button" className="btn" onClick={onCancelar}>
            Cancelar
          </button>
          <BotaoEnviar ocupado={ocupado} textoOcupado="Salvando garagem…">
            Salvar garagem
          </BotaoEnviar>
        </div>
      </form>
    </Card>
  );
}

export default function Garagens({ garagens, erroGaragens, recarregarGaragens }) {
  const [nova, setNova] = useParamUrl('nova');
  const [cidade, setCidade] = useParamUrl('cidade');
  const [confirmar, dialogo] = useConfirmar();

  const cidades = [...new Set(garagens.map((g) => g.endereco?.cidade))].sort((a, b) => a.localeCompare(b));
  const lista = garagens.filter((g) => !cidade || g.endereco?.cidade === cidade);

  return (
    <>
      {dialogo}
      <CabecalhoPagina
        titulo="Garagens"
        descricao="Unidades da rede no MongoDB: vagas e tarifas embutidas no documento, e campos livres que variam de garagem para garagem."
        acoes={
          !nova && (
            <a className="btn btn-primaria" href={`#garagens?${new URLSearchParams({ ...(cidade && { cidade }), nova: '1' })}`}>
              Cadastrar garagem
            </a>
          )
        }
      />

      <div className="pilha">
        <div className="linha" style={{ maxWidth: 380 }}>
          <Campo label="Filtrar por cidade" className="sem-margem">
            <select name="cidade" value={cidade} onChange={(e) => setCidade(e.target.value)}>
              <option value="">Todas as cidades ({garagens.length})</option>
              {cidades.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </Campo>
        </div>

        <Alerta>{erroGaragens}</Alerta>

        {nova && (
          <NovaGaragem
            onCancelar={() => setNova('', { replace: false })}
            onCriada={() => {
              setNova('', { replace: false });
              recarregarGaragens();
            }}
          />
        )}

        {lista.length === 0 && !erroGaragens ? (
          <Card>
            <Vazio titulo="Nenhuma garagem">
              Rode <code>npm run seed</code> em <code>backend/garagens-service</code> ou cadastre uma garagem.
            </Vazio>
          </Card>
        ) : (
          <div className="grade grade-cards">
            {lista.map((g) => (
              <CardGaragem key={g._id} g={g} onAlterado={recarregarGaragens} confirmar={confirmar} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
