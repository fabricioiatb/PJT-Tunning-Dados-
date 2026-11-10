import { useEffect, useState } from 'react';
import { api, brl, dataHora, duracao, pct, TIPOS, NOME_TIPO } from '../api';
import {
  Alerta,
  Badge,
  BotaoEnviar,
  CabecalhoPagina,
  Campo,
  Card,
  Carregando,
  InputPlaca,
  Placa,
  SelectGaragem,
  TipoVeiculo,
  Vazio,
  useAcao,
  useCarregar,
  useConfirmar,
} from '../ui';
import { useParamUrl } from '../url';

const REGRA = {
  MENSALISTA: 'Mensalista — sem cobrança',
  TOLERANCIA: 'Dentro da tolerância',
  POR_HORA: 'Cobrança por hora',
  DIARIA: 'Limitado pela diária máxima',
};

const descreverTarifa = (t) =>
  `${brl(t.primeira_hora)} a 1ª hora · ${brl(t.hora_adicional)} por hora adicional` +
  (t.diaria_maxima != null ? ` · diária máx. ${brl(t.diaria_maxima)}` : '') +
  ` · tolerância de ${t.tolerancia_minutos} min`;

function Recibo({ r }) {
  return (
    <div className="recibo" role="status" aria-live="polite">
      <div className="entre">
        <Placa>{r.placa}</Placa>
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
            <dd>{descreverTarifa(r.tarifa)}</dd>
          </>
        )}
      </dl>
      {r.mensalista_fonte === 'CHECKIN' && (
        <Alerta tipo="aviso">Serviço de Clientes fora do ar: foi usado o tipo de cliente registrado na entrada.</Alerta>
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
  const opcoes = TIPOS.filter((t) => !tiposAceitos.length || tiposAceitos.includes(t));

  useEffect(() => {
    if (!opcoes.includes(tipo)) setTipo(opcoes[0] || 'CARRO');
  }, [opcoes, tipo]);

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
    <Card titulo="Registrar entrada" id="checkin">
      <form onSubmit={enviar}>
        <div className="linha">
          <Campo label="Placa">
            <InputPlaca valor={placa} onChange={setPlaca} name="placa-entrada" />
          </Campo>
          <Campo label="Tipo de veículo">
            <select name="tipo" value={tipo} onChange={(e) => setTipo(e.target.value)}>
              {opcoes.map((t) => (
                <option key={t} value={t}>
                  {NOME_TIPO[t]}
                </option>
              ))}
            </select>
          </Campo>
        </div>
        <p className="nota" style={{ margin: '-4px 0 14px' }}>
          Se o veículo for cadastrado, vale o tipo do cadastro e o cliente é reconhecido como mensalista ou avulso.
        </p>
        <Alerta focar onFechar={() => setErro(null)}>
          {erro}
        </Alerta>
        <BotaoEnviar ocupado={ocupado} className="btn-verde btn-bloco" textoOcupado="Registrando entrada…">
          Registrar entrada
        </BotaoEnviar>
      </form>

      {resultado && (
        <div style={{ marginTop: 14 }}>
          <Alerta tipo="ok" onFechar={() => setResultado(null)}>
            <Placa>{resultado.placa}</Placa> entrou às {dataHora(resultado.entrada)} ·{' '}
            {resultado.mensalista
              ? 'mensalista (sem cobrança)'
              : resultado.veiculo_cadastrado
                ? 'cliente avulso cadastrado'
                : 'avulso não cadastrado'}{' '}
            · {NOME_TIPO[resultado.tipo_veiculo]}: {resultado.vagas.ocupadas}/{resultado.vagas.total} vagas ocupadas.
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

function CheckOut({ pedido, onFeito }) {
  const [placa, setPlaca] = useState('');
  const [previa, setPrevia] = useState(null);
  const [recibo, setRecibo] = useState(null);
  const { ocupado, erro, setErro, executar } = useAcao();

  const consultar = async (p) => {
    setPlaca(p);
    setRecibo(null);
    setPrevia(null);
    const r = await executar(() => api.sessaoAberta(p));
    if (r) setPrevia(r);
  };

  // "Saída" clicada na tabela de ocupação
  useEffect(() => {
    if (pedido) consultar(pedido.placa);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pedido]);

  const finalizar = async (e) => {
    e.preventDefault();
    const r = await executar(() => api.checkout({ placa: previa.placa }));
    if (r) {
      setRecibo(r);
      setPrevia(null);
      setPlaca('');
      onFeito();
    }
  };

  return (
    <Card titulo="Registrar saída" id="checkout">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          consultar(placa);
        }}
      >
        <div className="linha">
          <Campo label="Placa">
            <InputPlaca valor={placa} onChange={setPlaca} name="placa-saida" />
          </Campo>
          <div className="fixo" style={{ marginBottom: 14 }}>
            <BotaoEnviar ocupado={ocupado && !previa} className="" textoOcupado="Consultando…">
              Consultar sessão
            </BotaoEnviar>
          </div>
        </div>
      </form>
      <Alerta focar onFechar={() => setErro(null)}>
        {erro}
      </Alerta>

      {previa && (
        <form className="recibo" onSubmit={finalizar}>
          <div className="entre">
            <Placa>{previa.placa}</Placa>
            <Badge cor={previa.mensalista ? 'azul' : 'cinza'}>{previa.mensalista ? 'Mensalista' : 'Avulso'}</Badge>
          </div>
          <p className="suave" style={{ margin: '10px 0 0' }}>
            {previa.garagem_nome} · entrou {dataHora(previa.entrada)} · há {duracao(previa.minutos_ate_agora)}
          </p>
          <div className="recibo-valor">{brl(previa.valor_se_sair_agora)}</div>
          <p className="suave" style={{ margin: '0 0 14px' }}>
            Valor se sair agora
          </p>
          <BotaoEnviar ocupado={ocupado} className="btn-primaria btn-bloco" textoOcupado="Registrando saída…">
            Confirmar saída e cobrar {brl(previa.valor_se_sair_agora)}
          </BotaoEnviar>
        </form>
      )}
      {recibo && <Recibo r={recibo} />}
    </Card>
  );
}

function Ocupacao({ garagemId, versao, onSaida }) {
  const [confirmar, dialogo] = useConfirmar();
  const acao = useAcao();
  const { dados, erro, carregando, recarregar } = useCarregar(
    () => (garagemId ? api.ocupacao(garagemId) : Promise.resolve(null)),
    [garagemId, versao],
  );

  useEffect(() => {
    const t = setInterval(recarregar, 15000);
    return () => clearInterval(t);
  }, [recarregar]);

  if (!garagemId) return null;

  return (
    <Card
      id="ocupacao"
      titulo={`Ocupação agora${dados?.garagem_nome ? ` · ${dados.garagem_nome}` : ''}`}
      acoes={
        <button type="button" className="btn btn-pequeno" onClick={recarregar} disabled={carregando}>
          {carregando ? 'Atualizando…' : 'Atualizar ocupação'}
        </button>
      }
    >
      {dialogo}
      <Alerta>{erro}</Alerta>
      <Alerta focar onFechar={() => acao.setErro(null)}>
        {acao.erro}
      </Alerta>
      {dados?.aviso && <Alerta tipo="aviso">{dados.aviso}</Alerta>}
      {carregando && !dados ? (
        <Carregando texto="Carregando ocupação…" />
      ) : (
        dados && (
          <>
            <div className="ocupacao">
              {dados.por_tipo.map((t) => {
                const fracao = t.total ? t.ocupadas / t.total : 0;
                return (
                  <div className="ocup-item" key={t.tipo}>
                    <TipoVeiculo tipo={t.tipo} />
                    <div className="ocup-num">
                      {t.ocupadas} <small>/ {t.total ?? '?'} vagas</small>
                    </div>
                    <div
                      className={`barra ${fracao >= 0.9 ? 'alta' : fracao >= 0.6 ? 'media' : ''}`}
                      role="meter"
                      aria-label={`Ocupação de vagas de ${NOME_TIPO[t.tipo]}`}
                      aria-valuemin={0}
                      aria-valuemax={t.total ?? 0}
                      aria-valuenow={t.ocupadas}
                      aria-valuetext={`${t.ocupadas} de ${t.total ?? '?'} vagas (${pct(fracao)})`}
                    >
                      <i style={{ transform: `scaleX(${Math.min(fracao, 1)})` }} />
                    </div>
                    <small className="suave">{t.livres ?? '?'} livres</small>
                  </div>
                );
              })}
            </div>

            {dados.veiculos.length === 0 ? (
              <Vazio titulo="Nenhum veículo estacionado">Registre uma entrada para vê-la aqui.</Vazio>
            ) : (
              <div className="tabela-wrap">
                <table>
                  <caption className="sr-only">Veículos estacionados agora</caption>
                  <thead>
                    <tr>
                      <th scope="col">Placa</th>
                      <th scope="col">Tipo</th>
                      <th scope="col">Cliente</th>
                      <th scope="col">Entrada</th>
                      <th scope="col" className="num">
                        Tempo
                      </th>
                      <th scope="col">
                        <span className="sr-only">Ações</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {dados.veiculos.map((v) => (
                      <tr key={v.placa}>
                        <td>
                          <Placa>{v.placa}</Placa>
                        </td>
                        <td>
                          <TipoVeiculo tipo={v.tipo_veiculo} />
                        </td>
                        <td>
                          <Badge cor={v.mensalista ? 'azul' : 'cinza'}>{v.mensalista ? 'Mensalista' : 'Avulso'}</Badge>
                        </td>
                        <td>{dataHora(v.entrada)}</td>
                        <td className="num">{duracao(Math.ceil((Date.now() - new Date(v.entrada)) / 60000))}</td>
                        <td className="num">
                          <div className="card-acoes" style={{ justifyContent: 'flex-end' }}>
                            <button
                              type="button"
                              className="btn btn-pequeno"
                              onClick={() => onSaida(v.placa)}
                              aria-label={`Registrar saída de ${v.placa}`}
                            >
                              Registrar saída
                            </button>
                            <button
                              type="button"
                              className="btn btn-pequeno btn-perigo"
                              disabled={acao.ocupado}
                              aria-label={`Cancelar entrada de ${v.placa}`}
                              onClick={async () => {
                                const ok = await confirmar({
                                  titulo: `Cancelar a entrada de ${v.placa}?`,
                                  texto:
                                    'Use para um check-in registrado por engano: a sessão é excluída sem cobrança e a vaga é liberada.',
                                  acao: 'Cancelar entrada',
                                });
                                if (!ok) return;
                                const r = await acao.executar(() => api.removerSessao(v, garagemId));
                                if (r !== undefined) recarregar();
                              }}
                            >
                              Cancelar
                            </button>
                          </div>
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
  const [garagemId, setGaragemId] = useParamUrl('garagem');
  const [versao, setVersao] = useState(0);
  const [pedidoSaida, setPedidoSaida] = useState(null);

  // Sem garagem na URL (ou inválida): usa a primeira ativa.
  useEffect(() => {
    if (ativas.length && !ativas.some((g) => g._id === garagemId)) setGaragemId(ativas[0]._id);
  }, [ativas, garagemId, setGaragemId]);

  const garagem = garagens.find((g) => g._id === garagemId);
  const atualizar = () => setVersao((v) => v + 1);

  return (
    <>
      <CabecalhoPagina
        titulo="Operação"
        descricao="Entrada e saída de veículos. O valor é calculado no check-out com a tarifa vigente na entrada."
      />
      <div className="grade grade-2">
        <div className="pilha">
          <Card titulo="Garagem" id="garagem">
            <Alerta>{erroGaragens}</Alerta>
            <Campo label="Garagem em operação" className="sem-margem">
              <SelectGaragem
                garagens={garagens}
                valor={garagemId}
                onChange={(v) => setGaragemId(v, { replace: false })}
              />
            </Campo>
          </Card>
          <CheckIn garagemId={garagemId} garagem={garagem} onFeito={atualizar} />
          <CheckOut pedido={pedidoSaida} onFeito={atualizar} />
        </div>
        <Ocupacao
          garagemId={garagemId}
          versao={versao}
          onSaida={(placa) => {
            setPedidoSaida({ placa, t: Date.now() });
            document.getElementById('checkout-titulo')?.scrollIntoView({ block: 'start' });
          }}
        />
      </div>
    </>
  );
}
