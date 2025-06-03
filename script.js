// --- 1. CONFIGURAÇÃO DO SHEETSDB ---
const SHEETSDB_API_BASE_URL = 'https://sheetdb.io/api/v1/ovo0p2ncfaknr';

// URLs para as abas específicas na sua planilha
const RECEITAS_API_URL = `${SHEETSDB_API_BASE_URL}?sheet=Receitas`;
const DESPESAS_API_URL = `${SHEETSDB_API_BASE_URL}?sheet=Despesas`;

// --- 2. REFERÊNCIAS DOS ELEMENTOS HTML (Variáveis, dependendo da página) ---
// Elementos comuns (podem existir em ambas as páginas ou em apenas uma, mas declaramos aqui)
let transactionForm = null;
let descriptionInput = null;
let amountInput = null;
let typeInput = null;
let monthSelectAdd = null; // Apenas em add.html

let monthSelectView = null; // Apenas em view.html

let transactionsList = null;
let totalIncomeSpan = null;
let totalExpenseSpan = null;
let currentBalanceSpan = null;

let allLoadedTransactions = []; // Armazena todas as transações carregadas para filtragem
let totalIncome = 0;
let totalExpense = 0;

// --- 3. FUNÇÕES AUXILIARES ---

// Função para formatar o valor como moeda
function formatCurrency(value) {
    return `R$ ${parseFloat(value).toFixed(2).replace('.', ',')}`;
}

// Função para gerar um ID único para a transação
function generateUniqueId() {
    return Date.now().toString(36) + Math.random().toString(36).substring(2, 9);
}

// Função para normalizar MM/YYYY para sempre ter 2 dígitos no mês (ex: 6/2025 -> 06/2025)
function normalizeMmYyyy(mmYyyyString) {
    // Garante que a entrada seja uma string antes de tentar split
    const strValue = String(mmYyyyString); 
    if (!strValue || !strValue.includes('/')) {
        // Se não tiver '/', tenta converter de número para MM/YYYY (se for um número de data Excel)
        if (!isNaN(strValue) && !isNaN(parseFloat(strValue))) {
            const excelDate = parseFloat(strValue);
            // Excel dates start from 1900-01-01 (day 1). JS dates start from 1970-01-01.
            // Excel date 1 is Jan 1, 1900. JS date 0 is Jan 1, 1970.
            // Difference is 25569 days from 1900-01-01 to 1970-01-01.
            // Also, Excel erroneously considers 1900 a leap year, so subtract 1 more day if > 28 Feb 1900.
            const jsDate = new Date(Math.round((excelDate - 25569) * 86400 * 1000));
            
            // Ajuste para o problema do ano bissexto de 1900 no Excel
            if (excelDate < 60) { // Dates before March 1, 1900 are not affected by the bug
                // No adjustment needed
            } else if (excelDate === 60) { // March 1, 1900 (the bug makes it Feb 29, 1900)
                jsDate.setDate(jsDate.getDate() + 1); // Adjust to Mar 1
            } else { // Dates after March 1, 1900
                jsDate.setDate(jsDate.getDate() + 1); // Adjust for the skipped day
            }
            
            const month = (jsDate.getMonth() + 1).toString().padStart(2, '0');
            const year = jsDate.getFullYear().toString();
            return `${month}/${year}`;
        }
        return strValue; // Retorna o valor original se não for MM/YYYY ou um número
    }
    const [month, year] = strValue.split('/');
    return `${month.padStart(2, '0')}/${year}`;
}

// --- 4. FUNÇÕES DE OPERAÇÃO COM SHEETSDB ---

// Função para adicionar uma transação ao SheetsDB
async function addTransactionToSheetsDB(transactionData, type) {
    const targetUrl = type === 'income' ? RECEITAS_API_URL : DESPESAS_API_URL;
    const bodyData = {};

    bodyData.descricao = transactionData.description;
    bodyData.timestamp = transactionData.timestamp;
    bodyData.id = transactionData.id;
    bodyData.mesReferencia = transactionData.mesReferencia; // Já normalizado aqui

    if (type === 'income') {
        bodyData.valorEntrada = transactionData.amount;
    } else {
        bodyData.valorSaida = transactionData.amount;
    }

    try {
        const response = await fetch(targetUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(bodyData),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Erro ao adicionar: ${response.status} - ${errorText}`);
        }

        const result = await response.json();
        console.log("Transação adicionada com sucesso no SheetsDB!", result);
        return result;
    } catch (error) {
        console.error("Erro na requisição POST para SheetsDB:", error);
        alert("Ocorreu um erro ao adicionar a transação. Verifique o console.");
        throw error;
    }
}

// Função para deletar uma transação do SheetsDB
async function deleteTransactionFromSheetsDB(id, type) {
    const targetSheet = type === 'income' ? 'Receitas' : 'Despesas';
    // Correção: Usando os parâmetros column e value para deleção.
    const deleteUrl = `${SHEETSDB_API_BASE_URL}?sheet=${targetSheet}&column=id&value=${id}`;

    try {
        const response = await fetch(deleteUrl, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
            },
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Erro ao deletar: ${response.status} - ${errorText}`);
        }

        const result = await response.json();
        console.log("Transação deletada com sucesso no SheetsDB!", result);
        return result;
    } catch (error) {
        console.error("Erro na requisição DELETE para SheetsDB:", error);
        alert("Ocorreu um erro ao deletar a transação. Verifique o console.");
        throw error;
    }
}

// Função para buscar TODAS as transações do SheetsDB
async function getAllTransactionsFromSheetsDB() {
    let allTransactions = [];

    try {
        // Busca Receitas
        const incomeResponse = await fetch(RECEITAS_API_URL);
        if (!incomeResponse.ok) {
            const errorText = await incomeResponse.text();
            throw new Error(`Erro ao buscar receitas: ${incomeResponse.status} - ${errorText}`);
        }
        const incomeData = await incomeResponse.json();
        console.log("Dados de Receitas Brutos:", incomeData); // Log para depuração
        const incomes = incomeData.map(item => ({
            description: item.descricao,
            amount: parseFloat(item.valorEntrada),
            type: 'income',
            mesReferencia: normalizeMmYyyy(item.mesReferencia), // Normaliza ao carregar
            timestamp: item.timestamp,
            id: item.id
        }));
        allTransactions = allTransactions.concat(incomes);

        // Busca Despesas
        const expenseResponse = await fetch(DESPESAS_API_URL);
        if (!expenseResponse.ok) {
            const errorText = await expenseResponse.text();
            throw new Error(`Erro ao buscar despesas: ${expenseResponse.status} - ${errorText}`);
        }
        const expenseData = await expenseResponse.json();
        console.log("Dados de Despesas Brutos:", expenseData); // Log para depuração
        const expenses = expenseData.map(item => ({
            description: item.descricao,
            amount: parseFloat(item.valorSaida),
            type: 'expense',
            mesReferencia: normalizeMmYyyy(item.mesReferencia), // Normaliza ao carregar
            timestamp: item.timestamp,
            id: item.id
        }));
        allTransactions = allTransactions.concat(expenses);

        // Ordena todas as transações combinadas por mesReferencia (MM/YYYY) e depois por timestamp (mais recentes primeiro)
        allTransactions.sort((a, b) => {
            // Converte MM/YYYY para YYYYMM para ordenação correta como número
            const [monthA, yearA] = a.mesReferencia.split('/');
            const mesAnoNumA = parseInt(yearA) * 100 + parseInt(monthA);

            const [monthB, yearB] = b.mesReferencia.split('/');
            const mesAnoNumB = parseInt(yearB) * 100 + parseInt(monthB);

            if (mesAnoNumA === mesAnoNumB) {
                // Se o mês e ano são os mesmos, ordena por timestamp (mais recente primeiro)
                return new Date(b.timestamp) - new Date(a.timestamp);
            }
            // Ordena pelo mesAnoNum decrescente (do mais recente para o mais antigo)
            return mesAnoNumB - mesAnoNumA;
        });

        console.log("Todas as transações carregadas e processadas:", allTransactions); // Log final para depuração
        return allTransactions;

    } catch (error) {
        console.error("Erro ao buscar transações:", error);
        alert("Ocorreu um erro ao carregar as transações. Verifique o console e a configuração do SheetsDB/Planilha.");
        return [];
    }
}


// --- 5. FUNÇÕES DE UI E CÁLCULOS (Comuns às páginas) ---

function addTransactionToDOM(transaction) {
    const listItem = document.createElement('li');
    listItem.classList.add(transaction.type);
    
    const sign = transaction.type === 'expense' ? '-' : '+';
    const amountClass = transaction.type === 'expense' ? 'negative' : 'positive';

    listItem.innerHTML = `
        <span>${transaction.description} (${transaction.mesReferencia})</span> 
        <span class="${amountClass}">${sign} ${formatCurrency(transaction.amount)}</span>
        <button class="delete-btn" data-id="${transaction.id}" data-type="${transaction.type}">x</button>
    `;
    transactionsList.appendChild(listItem);

    // Adiciona listener para o botão de deletar no DOM
    listItem.querySelector('.delete-btn').addEventListener('click', async (e) => {
        const transactionId = e.target.dataset.id;
        const transactionType = e.target.dataset.type;

        try {
            await deleteTransactionFromSheetsDB(transactionId, transactionType);
            console.log("Transação deletada do SheetsDB, recarregando DOM...");
            // No caso de deleção, precisamos recarregar e filtrar/exibir as transações apropriadas
            if (window.location.pathname.includes('view.html')) {
                loadAndFilterTransactionsViewPage(); // Para a página de visualização
            } else if (window.location.pathname.includes('add.html')) {
                // Se estiver na página de adição, apenas recarregar para mostrar que sumiu
                loadAllTransactionsAddPage(); 
            }
        } catch (error) {
            console.error("Erro ao deletar transação no DOM:", error);
        }
    });
}

function updateSummary(transactionsToSum) { 
    totalIncome = 0;
    totalExpense = 0;

    transactionsToSum.forEach(transaction => {
        if (transaction.type === 'income') {
            totalIncome += transaction.amount;
        } else {
            totalExpense += transaction.amount;
        }
    });

    const balance = totalIncome - totalExpense;
    totalIncomeSpan.textContent = formatCurrency(totalIncome);
    totalExpenseSpan.textContent = formatCurrency(totalExpense);
    currentBalanceSpan.textContent = formatCurrency(balance);
    
    if (balance < 0) {
        currentBalanceSpan.classList.add('negative');
        currentBalanceSpan.classList.remove('positive');
    } else {
        currentBalanceSpan.classList.add('positive');
        currentBalanceSpan.classList.remove('negative');
    }
}


// --- 6. LÓGICA ESPECÍFICA PARA CADA PÁGINA ---

// --- Lógica para add.html ---
async function setupAddPage() {
    transactionForm = document.getElementById('transaction-form');
    descriptionInput = document.getElementById('description');
    amountInput = document.getElementById('amount');
    monthSelectAdd = document.getElementById('month-select-add');
    typeInput = document.getElementById('type');

    // Elementos da lista e resumo para feedback em add.html
    transactionsList = document.getElementById('transactions');
    totalIncomeSpan = document.getElementById('total-income'); 
    totalExpenseSpan = document.getElementById('total-expense');
    currentBalanceSpan = document.getElementById('current-balance');

    // Se houver resumo na página de adição, carregue as transações para ele
    if (transactionsList && totalIncomeSpan && totalExpenseSpan && currentBalanceSpan) {
        loadAllTransactionsAddPage();
    }

    transactionForm.addEventListener('submit', async (e) => {
        e.preventDefault(); 

        const description = descriptionInput.value;
        const amount = parseFloat(amountInput.value);
        const mesReferencia = monthSelectAdd.value; // Pega o valor do seletor de mês
        const type = typeInput.value; 

        if (!mesReferencia) { // Valida se um mês foi selecionado
            alert('Por favor, selecione um mês de referência.');
            return;
        }

        if (description && amount) {
            const newTransaction = {
                description,
                amount,
                type,
                mesReferencia: normalizeMmYyyy(mesReferencia), // <--- PRINCIPAL MUDANÇA AQUI!
                timestamp: new Date().toISOString(), 
                id: generateUniqueId() 
            };
            console.log("Nova transação a ser adicionada:", newTransaction); // Log para depuração

            try {
                await addTransactionToSheetsDB(newTransaction, type);
                console.log("Transação adicionada com sucesso no SheetsDB!");
                alert("Transação adicionada com sucesso!"); // Feedback direto para o usuário
                
                // Se houver resumo na página de adição, recarregue
                if (transactionsList) {
                    loadAllTransactionsAddPage(); 
                }

                // Limpa o formulário para a próxima entrada
                descriptionInput.value = '';
                amountInput.value = '';
                typeInput.value = 'expense'; 
            } catch (error) {
                console.error("Erro ao adicionar transação ao SheetsDB:", error);
                alert("Ocorreu um erro ao adicionar a transação. Verifique o console.");
            }
        } else {
            alert('Por favor, preencha todos os campos (descrição e valor).');
        }
    });

    // Opcional: pré-selecionar o mês atual no seletor de adição
    const currentDate = new Date();
    const currentMonthFormatted = `${(currentDate.getMonth() + 1).toString().padStart(2, '0')}/${currentDate.getFullYear()}`; 
    if (monthSelectAdd.querySelector(`option[value="${currentMonthFormatted}"]`)) {
        monthSelectAdd.value = currentMonthFormatted;
    } else {
        // Se o mês atual não estiver nas opções, seleciona o primeiro (ou deixa vazio)
        monthSelectAdd.value = ''; 
    }
}

// Carrega todas as transações para exibição na página de adição (se aplicável)
async function loadAllTransactionsAddPage() {
    if (!transactionsList) return; // Garante que o elemento existe
    
    transactionsList.innerHTML = ''; 
    totalIncome = 0; 
    totalExpense = 0;

    allLoadedTransactions = await getAllTransactionsFromSheetsDB(); // Carrega tudo

    if (allLoadedTransactions.length === 0) {
        console.log('Nenhuma transação encontrada para exibição na página de adição.');
        updateSummary([]);
        return;
    }

    allLoadedTransactions.forEach(transaction => {
        // Exibe todas as transações na página de adição
        addTransactionToDOM(transaction);
    });
    updateSummary(allLoadedTransactions); // Atualiza resumo para o total geral
}


// --- Lógica para view.html ---
async function setupViewPage() {
    monthSelectView = document.getElementById('month-select-view');
    transactionsList = document.getElementById('transactions');
    totalIncomeSpan = document.getElementById('total-income');
    totalExpenseSpan = document.getElementById('total-expense');
    currentBalanceSpan = document.getElementById('current-balance');

    // Define o listener para o seletor de filtro
    monthSelectView.addEventListener('change', filterTransactionsByMonth);

    // Carrega todas as transações e aplica o filtro inicial
    await loadAndFilterTransactionsViewPage();
}

async function loadAndFilterTransactionsViewPage() {
    allLoadedTransactions = await getAllTransactionsFromSheetsDB(); // Carrega TUDO

    // Seleciona o mês atual no seletor de filtro quando a página carrega.
    const currentDate = new Date();
    const currentMonthFormatted = `${(currentDate.getMonth() + 1).toString().padStart(2, '0')}/${currentDate.getFullYear()}`; 
    
    if (monthSelectView.querySelector(`option[value="${currentMonthFormatted}"]`)) {
        monthSelectView.value = currentMonthFormatted;
    } else {
        monthSelectView.value = 'all'; // Default para "Todos os Meses" se o mês atual não estiver nas opções
    }

    filterTransactionsByMonth(); // Aplica o filtro com o mês selecionado
}

function filterTransactionsByMonth() {
    const selectedMonthValue = monthSelectView.value; // Valor do seletor de filtro (MM/YYYY ou 'all')
    let filteredTransactions = [];

    console.log("Mês selecionado no filtro (view.html):", selectedMonthValue); // Log para depuração
    console.log("Todas as transações disponíveis para filtrar:", allLoadedTransactions); // Log para depuração

    if (selectedMonthValue === 'all') {
        filteredTransactions = allLoadedTransactions;
    } else {
        filteredTransactions = allLoadedTransactions.filter(t => {
            const match = t.mesReferencia === selectedMonthValue;
            // Descomente a linha abaixo para uma depuração muito detalhada da comparação:
            // console.log(`Comparando: '${t.mesReferencia}' com '${selectedMonthValue}' -> ${match}`); 
            return match;
        });
    }

    console.log("Transações FILTRADAS para exibição:", filteredTransactions); // Log para depuração

    transactionsList.innerHTML = ''; // Limpa a lista exibida

    if (filteredTransactions.length === 0) {
        console.log('Nenhuma transação encontrada para o mês selecionado.');
        updateSummary([]);
        return;
    }

    // Ordena as transações filtradas por timestamp (mais recentes primeiro)
    filteredTransactions.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    filteredTransactions.forEach(transaction => {
        addTransactionToDOM(transaction);
    });
    updateSummary(filteredTransactions); // Atualiza o resumo APENAS com as transações filtradas
}


// --- 7. INICIALIZAÇÃO COM BASE NA PÁGINA ATUAL ---

document.addEventListener('DOMContentLoaded', () => {
    const path = window.location.pathname;

    if (path.includes('add.html')) {
        setupAddPage();
    } else if (path.includes('view.html')) {
        setupViewPage();
    } else {
        // Se for index.html ou outra página, não faz nada específico no script.js
        console.log("Página inicial ou desconhecida. Nenhuma lógica específica do script.js aqui.");
    }
});