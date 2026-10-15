# Guia do HTMLEdit

[English](../../README.md) · [한국어](README.ko.md) · [Español](README.es.md) · [日本語](README.ja.md) · [Português (Brasil)](README.pt-BR.md)

Edite visualmente o HTML criado por IA, deixe notas em elementos específicos e peça ao Claude Code ou Codex para aplicá-las. O HTMLEdit funciona localmente, sem conta ou chave de API de IA. A versão 1.4.0 adiciona inserção de imagens. Windows com Chrome/Edge continua sendo o ambiente principal. Linux/macOS são experimentais: os testes automáticos com Chrome passaram no Ubuntu 24.04 WSL2 e macOS 15.6.1 Apple Silicon; Safari e os seletores nativos ainda não foram verificados manualmente.

## Instalar e abrir

É necessário Node.js **22.12+** e Claude Code ou Codex executado no seu computador. Execute os comandos fora do repositório do código-fonte do HTMLEdit:

```sh
npx --yes @woody_s/htmledit@latest install --agent all
npx --yes @woody_s/htmledit@latest open "./document.html"
```

Use `--agent claude` ou `--agent codex` para instalar apenas um skill. No Claude Code, use `/htmledit`; no Codex, `$htmledit`, ou peça para abrir seu HTML com o HTMLEdit. Se o skill não aparecer, inicie uma nova sessão de IA. O arquivo de trabalho `document.review.html` é criado ao lado do original, que é preservado. Se já existir, abra esse arquivo de trabalho diretamente.

## Idioma

O menu **Idioma** oferece coreano, inglês, espanhol, japonês e português do Brasil. **Automático** usa o primeiro idioma suportado das preferências do navegador; se nenhum corresponder, usa inglês. Variantes regionais são agrupadas, como `es-MX → es` e `pt-PT → pt-BR`.

A escolha manual é mantida entre documentos e portas no modo conectado. No modo de download, ela é salva para o endereço atual do navegador. Mudar o idioma preserva seleção, textos e notas em edição, histórico e trabalho não salvo. O HTML do usuário, seu atributo `lang`, nomes de arquivos e conteúdo das notas não são traduzidos. Os exemplos usam o idioma escolhido no momento em que são abertos.

A CLI prioriza `--lang`, a escolha manual salva, o idioma do sistema e, por último, inglês. `open --lang` define apenas o idioma inicial dessa abertura, sem alterar a preferência salva:

```sh
npx --yes @woody_s/htmledit@latest open "./document.html" --lang pt-BR
npx --yes @woody_s/htmledit@latest --help --lang pt-BR
```

Valores: `ko`, `en`, `es`, `ja`, `pt-BR`; variantes regionais correspondentes também são reconhecidas. Comandos, chaves JSON, códigos de erro e IDs permanecem iguais. A preferência fica em `~/.htmledit/preferences.json` ou em `HTMLEDIT_HOME`. Se o salvamento da preferência falhar, suas edições são preservadas, mas o idioma pode não ser mantido na próxima sessão.

## Editar e aplicar notas

1. Clique em um elemento para mudar texto, cor e tamanho da fonte. Clique duas vezes para editar na tela. Ctrl+Enter aplica e Esc cancela. A composição IME, os destaques e os links aninhados são preservados.
2. Use **Selecionar elemento pai** para escolher um cartão inteiro. Você pode excluir elementos ou substituir imagens PNG, JPEG, WebP e GIF. A imagem nova é incorporada ao HTML, inclusive ao substituir imagens responsivas.
3. Escolha **Adicionar notas**, selecione o elemento e a posição **Este elemento / Antes / Depois / Dentro**. Descreva o pedido. Use notas para novos elementos e mudanças de layout. Os marcadores numerados correspondem à lista de notas.
4. Aplique o texto e adicione ou salve a nota antes de clicar em **Salvar e copiar pedido para IA**. No modo conectado, o arquivo de trabalho é salvo antes de copiar o pedido com seu caminho. **Salvar arquivo de trabalho** apenas salva. No modo de download, anexe o HTML de revisão junto com o pedido.
5. Cole o pedido na conversa com a IA. O skill executa `status → checkout → editar candidato → apply → status`. Apply verifica a revisão, cria um backup e atualiza o arquivo. O editor é atualizado automaticamente quando não há alterações não salvas.
6. Confira o resultado e as notas concluídas. **Salvar HTML final** baixa `document.edited.html` sem notas ou IDs do editor. Esse arquivo não restaura as notas anteriores.

As notas podem ser editadas, excluídas, concluídas, reabertas ou vinculadas a outro destino. Destinos ausentes ou duplicados não são adivinhados. Uma exclusão concluída pode deixar a nota com **Sem destino**. O aplicativo não decide automaticamente se um pedido foi atendido.

A cópia é interrompida quando há entradas não aplicadas, falhas de salvamento, conflitos ou alterações durante o salvamento. Se o arquivo for salvo, mas a cópia falhar, copie o pedido pela ajuda.

## Trocar documentos, interagir e recuperar

**Abrir outro documento** pergunta se deseja salvar e abre a janela de seleção do sistema. Cancelar ou falhar ao salvar mantém o documento atual. Arquivos de revisão existentes não são sobrescritos; servidores e backups anteriores são mantidos. Os botões padrão da janela seguem o idioma do sistema operacional.

Use **Interagir** em documentos confiáveis para navegar por menus e abas. Na tela desejada, escolha **Editar diretamente** ou **Adicionar notas**. **Voltar à primeira tela** reinicia a navegação sem descartar edições ou notas. São suportadas mudanças de classe, estilo e visibilidade dos elementos originais; a edição de elementos criados por scripts, valores de formulários e canvas não é suportada. Navegação e rolagem são estados da sessão. Os scripts originais permanecem na exportação.

O HTML de revisão contém notas e IDs invisíveis e um comentário de instruções para a IA em inglês. Navegadores comuns mostram apenas o documento. Metadados corrompidos ou incompatíveis bloqueiam o salvamento. Guarde o original antes de escolher **Excluir notas ilegíveis**. Arquivos salvos da visualização de código-fonte do navegador são restaurados como documentos; exemplos normais de código são preservados.

No modo conectado, rascunhos, candidatos e backups com os bytes exatos ficam em `.htmledit/` ao lado do documento. As revisões são verificadas ao gravar. Se houver alterações externas enquanto você edita, use **Salvar minhas edições separadamente** antes de **Reabrir versão do disco**. Outros programas não participam do bloqueio de gravação: a IA deve usar `apply`, nunca sobrescrever diretamente o arquivo de revisão.

O modo de download guarda um rascunho recente no IndexedDB do endereço atual após cerca de 0,6 segundo. Salve um HTML para manter o trabalho a longo prazo. Desfazer/refazer mantém 50 alterações da sessão atual. Restaurar rascunhos ou carregar resultados da IA não restaura o histórico anterior; versões antigas do arquivo ficam nos backups.

## Atualizar, encerrar e desinstalar

Repita o comando de instalação para atualizar e abra uma nova sessão do editor. Os ambientes de execução ficam fixados em `~/.htmledit/versions/<version>` e sobrevivem à limpeza do cache npm. Skills modificados são protegidos: faça backup da pasta exata indicada no erro antes de reinstalar.

Runner do Codex: `~/.agents/skills/htmledit/scripts/run.mjs`. Runner do Claude Code: `~/.claude/skills/htmledit/scripts/run.mjs`.

```sh
node "<skill-directory>/scripts/run.mjs" status --file "./document.review.html" --json
node "<skill-directory>/scripts/run.mjs" stop --file "./document.review.html"
node "<skill-directory>/scripts/run.mjs" uninstall --agent all
```

Encerre primeiro os servidores ativos. A desinstalação remove os skills gerenciados, mas preserva documentos, backups, preferências, ambientes de execução e servidores ativos. Uma IA em uma nuvem independente não acessa diretamente os arquivos do seu PC. O suporte se limita aos ambientes verificados; outras distribuições Linux, Macs Intel e outras versões do macOS não foram verificados.

## Arquivos suportados e dados

Use um único HTML estático UTF-8 com CSS e imagens incorporados: até 25MB por HTML, 10MB por imagem substituída e 5.000 notas com 1 a 20.000 caracteres cada. A sintaxe HTML pode ser normalizada ao salvar. URLs de recursos externos são mantidos e pastas locais relacionadas não são coletadas. Aplicativos React, gráficos dinâmicos e scripts de execução do Tailwind estão fora do escopo. As larguras de desktop, 768px e 390px ajudam a verificar layouts responsivos.

Os modos de edição e notas bloqueiam scripts. Interagir executa scripts internos em uma origem isolada, sem expor o armazenamento do editor ou o token de conexão. Scripts externos, fetch/XHR, formulários, popups e navegação superior são bloqueados. Scripts do documento ainda podem ler a prévia e enviar dados por imagens, estilos ou navegação do próprio frame. Use Interagir apenas em documentos confiáveis. Se a navegação do frame interromper a conexão, volte à primeira tela.

O servidor escuta em `127.0.0.1` e acessa o arquivo escolhido. Não compartilhe seu URL: ele contém um token de edição. O HTMLEdit não chama a IA nem coleta telemetria de uso. Ao pedir a uma IA para processar um documento, aplicam-se os preços e as políticas de dados desse serviço.

## Desenvolvimento e referências

```sh
npm ci
npm run build
npm start
npm test
npm run test:e2e
npm run test:package
```

O modo de download usa `http://127.0.0.1:5173`. No Windows, `start.cmd` também instala, compila e abre o editor; feche o terminal ou use Ctrl+C para encerrá-lo. Use `npm run dev` para desenvolver. Os testes exigem Chrome em todos os ambientes e também Edge no Windows. A verificação no Safari real é registrada separadamente.

Exemplos: `public/examples/<language>/` no código e `dist/examples/<language>/` no pacote. [Formato das notas](REVIEW_FORMAT.pt-BR.md), [terminologia](GLOSSARY.md), [histórico de verificação](../SKILLS_VERIFICATION.md). Licença MIT.

## Preparação por sistema

Ubuntu e WSLg exigem Chrome, zenity e xdg-utils. Instale as ferramentas com `sudo apt-get install zenity xdg-utils`. O WSL precisa de uma sessão WSLg e de Node e Chrome para Linux. O acesso pelo navegador Windows é verificado separadamente. O macOS usa o seletor integrado; use Cmd em vez de Ctrl nos atalhos de edição.

Por SSH ou sem interface gráfica, execute `open "./document.html" --no-browser --json`. A URL pertence ao computador servidor. Use um túnel SSH de loopback para a porta indicada; não exponha o servidor publicamente. O seletor aparece no desktop do servidor. Sem desktop ou seletor, abra outro arquivo pela CLI. Não publique o token da URL em registros compartilhados.

[Verification / 검증 기록](../SKILLS_VERIFICATION.md)

## Inserir imagens

Selecione um elemento e clique em **Inserir imagem**. Escolha **Antes**, **Depois** ou **No final, dentro**. O marcador e a prévia do documento mostram o resultado antes da aplicação. Em tabelas e listas, selecione uma célula, item de lista ou área de conteúdo adequada.

Escolha um arquivo local PNG, JPEG, WebP ou GIF, arraste-o para o painel, cole uma imagem com Ctrl+V / Cmd+V na área de colagem ou carregue uma URL direta HTTP/HTTPS. É permitida uma imagem por vez, de até 10MB, que possa ser decodificada. O download por URL não envia credenciais, tem limite de 15 segundos e respeita as restrições de acesso do navegador. Se o site bloquear o acesso, use um arquivo baixado ou cole a imagem. SVG, trechos HTML da área de transferência e várias imagens de uma vez não são aceitos.

Defina o tamanho original (limitado à largura disponível) ou 1–100% da largura da área, alinhamento à esquerda/centro/direita e texto alternativo. **Aplicar imagem** inclui os dados no HTML e cria uma etapa de desfazer. A prévia não altera o arquivo salvo nem o histórico. O HTML completo, incluindo as imagens, deve ter até 25MB. Não há compressão nem conversão automática de formato.

A imagem inserida permanece selecionada. Use **Tamanho e alinhamento da imagem** para ajustes posteriores ou adicione uma nota pedindo alterações de layout à IA. **Substituir imagem** usa as mesmas entradas e preserva os estilos de layout existentes. Aplique ou cancele o painel antes de salvar e copiar o pedido para a IA. O fluxo checkout/apply e o formato review v1 permanecem iguais.

## Seleção múltipla e tecla Del

Clique para selecionar um elemento. Ctrl+clique (Cmd+clique no Mac) adiciona ou remove elementos. Cada alvo recebe uma borda. **Adicionar uma nota aos elementos selecionados** cria uma única solicitação conjunta, com o mesmo número em todos os alvos. A lista permite visitar cada alvo e mostra os ausentes. Reatribuir substitui os alvos pela seleção atual.

**Del** exclui os elementos selecionados sem confirmação. **Ctrl+Z / Cmd+Z** restaura toda a exclusão em uma etapa. As notas são mantidas. Esse atalho não exclui elementos durante a digitação de textos ou notas, a edição de texto na página, o uso de diálogos ou o modo Interagir. O corpo inteiro do documento não pode ser excluído.

Na edição direta, a seleção múltipla oferece exclusão em lote. Selecione um elemento para editar texto, cor, tamanho ou imagem; estilos em lote não estão incluídos. Notas com um alvo continuam em review v1; arquivos com notas conjuntas usam v2. Atualize o editor e o runtime de IA antes de usá-las. Versões anteriores rejeitam v2 para evitar a perda de alvos.
