import { useEffect, useState } from 'react';
import { api, brl, dataHora, duracao, TIPOS, NOME_TIPO } from '../api';
import { Alerta, Badge, Campo, Card, Carregando, SelectGaragem, TipoVeiculo, Vazio, useAcao, useCarregar } from '../ui';

const REGRA = {
  MENSALISTA: 'Mensalista — sem cobrança',
  TOLERANCIA: 'Dentro da tolerância',
  POR_HORA: 'Cobrança por hora',
  DIARIA: 'Limitado pela diária',
};

function Recibo({ r }) {
  return (
    <div className="recibo">
      <div className="entre">
        <span className="placa">{r.placa}</span>
        <Badge cor={r.mensalista ? 'azul' : 'cinza'}>{r.mensalista ? 'Mensalista' : 'Avulso'}</Badge>
      </div>
      <div className="recibo-valor">{brl(r.valor)}</div>
      <div className="suave">{REGRA[r.regra] || r.regra}</div>
      <dl>
        <dt>Garagem</dt>
        <dd>{r.garagem_nome}</dd>
        <dt>Entrada</dt>
        <dd>{dataHora(r.entrada)}</dd>
        <dt>Saída</dt>
        <dd>{dataHora(r.saida)}</dd>
        <dt>Permanência</dt>
        <dd>{duracao(r.minutos)}</dd>
        {r.tarifa && (
          <>
            <dt>Tarifa</dt>
            <dd>
              {brl(r.tarifa.primeira_hora)} 1ª hora · {brl(r.tarifa.hora_adicional)}/h adicional
              {r.tarifa.diaria_maxima != null && ` · diária ${brl(r.tarifa.diaria_maxima)}`} · tolerância{' '}
              {r.tarifa.tolerancia_minutos} min
            </dd>
          </>
        )}
      </dl>
      {r.mensalista_fonte === 'CHECKIN' && (
        <Alerta tipo="aviso">Serviço de Clientes fora do ar: usado o tipo registrado na entrada.</Alerta>
      )}
    </div>
  );
}

function CheckIn({ garagemId, garagem, onFeito }) {
  const [placa, setPlaca] = useState('');
  const [tipo, setTipo] = useState('CARRO');
  const [resultado, setResultado] = useState(null);
  const { ocupado, erro, setErro, executar } = useAcao();

  const tiposAceitos = (garagem?.vagas || []).map((v) => v.tipo);

  const enviar = async (e) => {
    e.preventDefault();
    setResultado(null);
    const r = await executar(() => api.checkin({ garagem_id: garagemId, placa, tipo_veiculo: tipo }));
    if (r) {
      setResultado(r);
      setPlaca('');
      onFeito();
    }
  };

  return (
    <Card titulo="Entrada (check-in)">
      <form onSubmit={enviar}>
        <div className="linha">
          <Campo label="Placa">
            <input
              className="input-placa"
              value={placa}
              onChange={(e) => setPlaca(e.target.value.toUpperCase())}
              placeholder="ABC1D23"
              maxLength={8}
              required
            />
          </Campo>
          <Campo label="Tipo" dica="Se cadastrado, vale o do cadastro">
            <select value={tipo} onChange={(e) => setTipo(e.target.value)}>
              {TIPOS.filter((t) => !tiposAceitos.length || tiposAceitos.includes(t)).map((t) => (
                <option key={t} value={t}>
                  {NOME_TIPO[t]}
                </option>
              ))}
            </select>
          </Campo>
        </div>
        <Alerta onFechar={() => setErro(null)}>{erro}</Alerta>
        <button className="btn btn-verde btn-bloco" disabled={ocupado || !garagemId}>
          {ocupado ? 'Registrando…' : 'Registrar entrada'}
        </button>
      </form>
      {resultado && (
        <div style={{ marginTop: 12 }}>
          <Alerta tipo="ok" onFechar={() => setResultado(null)}>
            <span className="placa">{resultado.placa}</span> entrou às {dataHora(resultado.entrada)} ·{' '}
            {resultado.mensalista
              ? 'Mensalista (sem cobrança)'
              : resultado.veiculo_cadastrado
                ? 'Cliente avulso cadastrado'
                : 'Avulso (não cadastrado)'}{' '}
            · {NOME_TIPO[resultado.tipo_veiculo]}: {resultado.vagas.ocupadas}/{resultado.vagas.total} vagas
          </Alerta>
          {resultado.avisos?.map((a) => (
            <Alerta key={a} tipo="aviso">
              {a}
            </Alerta>
          ))}
        </div>
      )}
    </Card>
  );
}

function CheckOut({ placaInicial, onFeito }) {
  const [placa, setPlaca] = useState('');
  const [previa, setPrevia] = useState(null);
  const [recibo, setRecibo] = useState(null);
  const { ocupado, erro, setErro, executar } = useAcao();

  useEffect(() => {
    if (placaInicial) consultar(placaInicial.placa);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placaInicial]);

  const consultar = async (p = placa) => {
    setPlaca(p);
    setRecibo(null);
    setPrevia(null);
    const r = await executar(() => api.sessaoAberta(p));
    if (r) setPrevia(r);
  };

  const finalizar = async () => {
    const r = await executar(() => api.checkout({ placa: previa.placa }));
    if (r) {
      setRecibo(r);
      setPrevia(null);
      setPlaca('');
      onFeito();
    }
  };

  return (
    <Card titulo="Saída (check-out)">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          consultar();
        }}
      >
        <div className="linha">
          <Campo label="Placa">
            <input
              className="input-placa"
              value={placa}
              onChange={(e) => setPlaca(e.target.value.toUpperCase())}
              placeholder="ABC1D23"
              maxLength={8}
              required
            />
          </Campo>
          <div className="fixo" style={{ marginBottom: 12 }}>
            <button className="btn" disabled={ocupado}>
              Consultar
            </button>
          </div>
        </div>
      </form>
      <Alerta onFechar={() => setErro(null)}>{erro}</Alerta>

      {previa && (
        <div className="recibo">
          <div className="entre">
            <span className="placa">{previa.placa}</span>
            <Badge cor={previa.mensalista ? 'azul' : 'cinza'}>{previa.mensalista ? 'Mensalista' : 'Avulso'}</Badge>
          </div>
          <p className="suave" style={{ margin: '8px 0 0' }}>
            {previa.garagem_nome} · entrou {dataHora(previa.entrada)} · há {duracao(previa.minutos_ate_agora)}
          </p>
          <div className="recibo-valor">{brl(previa.valor_se_sair_agora)}</div>
          <p className="suave" style={{ margin: '0 0 12px' }}>
            Valor se sair agora
          </p>
          <button className="btn btn-primaria btn-bloco" onClick={finalizar} disabled={ocupado}>
            {ocupado ? 'Finalizando…' : 'Confirmar saída'}
          </button>
        </div>
      )}
      {recibo && <Recibo r={recibo} />}
    </Card>
  );
}

function Ocupacao({ garagemId, versao, onSaida }) {
  const { dados, erro, carregando, recarregar } = useCarregar(
    () => (garagemId ? api.ocupacao(garagemId) : Promise.resolve(null)),
    [garagemId, versao]
  );

  useEffect(() => {
    const t = setInterval(recarregar, 15000);
    return () => clearInterval(t);
  }, [recarregar]);

  if (!garagemId) return null;

  return (
    <Card
      titulo={`Ocupação agora${dados?.garagem_nome ? ` — ${dados.garagem_nome}` : ''}`}
      acoes={
        <button className="btn btn-pequeno" onClick={recarregar}>
          Atualizar
        </button>
      }
    >
      <Alerta>{erro}</Alerta>
      {dados?.aviso && <Alerta tipo="aviso">{dados.aviso}</Alerta>}
      {carregando && !dados ? (
        <Carregando />
      ) : (
        dados && (
          <>
            <div className="ocupacao">
              {dados.por_tipo.map((t) => {
                const pct = t.ocupacao_percentual ?? 0;
                return (
                  <div className="ocup-item" key={t.tipo}>
                    <TipoVeiculo tipo={t.tipo} />
                    <div className="ocup-num">
                      {t.ocupadas} <small>/ {t.total ?? '?'} vagas</small>
                    </div>
                    <div className={`barra ${pct >= 90 ? 'alta' : pct >= 60 ? 'media' : ''}`}>
                      <i style={{ width: `${Math.min(pct, 100)}%` }} />
                    </div>
                    <small className="suave">{t.livres ?? '?'} livres</small>
                  </div>
                );
              })}
            </div>

            {dados.veiculos.length === 0 ? (
              <Vazio>Nenhum veículo estacionado.</Vazio>
            ) : (
              <div className="tabela-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Placa</th>
                      <th>Tipo</th>
                      <th>Cliente</th>
                      <th>Entrada</th>
                      <th>Tempo</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {dados.veiculos.map((v) => (
                      <tr key={v.placa}>
                        <td>
                          <span className="placa">{v.placa}</span>
                        </td>
                        <td>
                          <TipoVeiculo tipo={v.tipo_veiculo} />
                        </td>
                        <td>
                          <Badge cor={v.mensalista ? 'azul' : 'cinza'}>{v.mensalista ? 'Mensalista' : 'Avulso'}</Badge>
                        </td>
                        <td>{dataHora(v.entrada)}</td>
                        <td>{duracao(Math.ceil((Date.now() - new Date(v.entrada)) / 60000))}</td>
                        <td className="num">
                          <button className="btn btn-pequeno" onClick={() => onSaida(v.placa)}>
                            Saída
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )
      )}
    </Card>
  );
}

export default function Operacao({ garagens, erroGaragens }) {
  const ativas = garagens.filter((g) => g.ativa);
  const [garagemId, setGaragemId] = useState(() => localStorage.getItem('garagemOperacao') || '');
  const [versao, setVersao] = useState(0);
  const [saida, setSaida] = useState(null);

  // Garante uma garagem válida selecionada
  useEffect(() => {
    if (ativas.length && !ativas.some((g) => g._id === garagemId)) setGaragemId(ativas[0]._id);
  }, [ativas, garagemId]);

  useEffect(() => {
    if (garagemId) localStorage.setItem('garagemOperacao', garagemId);
  }, [garagemId]);

  const garagem = garagens.find((g) => g._id === garagemId);
  const atualizar = () => setVersao((v) => v + 1);

  return (
    <div className="grade grade-2">
      <div className="pilha">
        <Card titulo="Garagem">
          <Alerta>{erroGaragens}</Alerta>
          <SelectGaragem garagens={garagens} valor={garagemId} onChange={setGaragemId} />
        </Card>
        <CheckIn garagemId={garagemId} garagem={garagem} onFeito={atualizar} />
        <CheckOut placaInicial={saida} onFeito={atualizar} />
      </div>
      <Ocupacao garagemId={garagemId} versao={versao} onSaida={(placa) => setSaida({ placa, t: Date.now() })} />
    </div>
  );
}
