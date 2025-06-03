// --- 1. CONFIGURAÇÃO DO SHEETSDB ---
const SHEETSDB_API_BASE_URL = 'https://sheetdb.io/api/v1/ovo0p2ncfaknr';

// URLs para as abas específicas na sua planilha
const RECEITAS_API_URL = `${SHEETSDB_API_BASE_URL}?sheet=Receitas`;
const DESPESAS_API_URL = `${SHEETSDB_API_BASE_URL}?sheet=Despesas`;

// --- 2. REFERÊNCIAS DOS ELEMENTOS HTML ---
const transactionForm = document.getElementById('transaction-form');
const descriptionInput = document.getElementById('description');
const amountInput = document.getElementById('amount');
const typeInput = document.getElementById('type'); // Este é o select: 'expense' ou 'income'
const transactionsList = document.getElementById('transactions');
const totalIncomeSpan = document.getElementById('total-income');
const totalExpenseSpan = document.getElementById('total-expense');
const currentBalanceSpan = document.getElementById('current-balance');
const monthSelect = document.getElementById('month-select'); // O ÚNICO seletor de mês

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
    if (!mmYyyyString || !mmYyyyString.includes('/')) return mmYyyyString;
    const [month, year] = mmYyyyString.split('/');
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
    bodyData.mesReferencia = normalizeMmYyyy(transactionData.mesReferencia); // Normaliza antes de enviar

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
    const targetUrl = type === 'income' ? RECEITAS_API_URL : DESPESAS_API_URL;
    const deleteUrl = `${targetUrl}/id/${id}`;

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
        const incomes = incomeData.map(item => ({
            description: item.descricao,
            amount: parseFloat(item.valorEntrada),
            type: 'income',
            mesReferencia: normalizeMmYyyy(item.mesReferencia), // Normaliza ao ler também!
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
        const expenses = expenseData.map(item => ({
            description: item.descricao,
            amount: parseFloat(item.valorSaida),
            type: 'expense',
            mesReferencia: normalizeMmYyyy(item.mesReferencia), // Normaliza ao ler também!
            timestamp: item.timestamp,
            id: item.id
        }));
        allTransactions = allTransactions.concat(expenses);

        // Ordena todas as transações combinadas por timestamp (mais recentes primeiro)
        allTransactions.sort((a, b) => {
            return new Date(b.timestamp) - new Date(a.timestamp);
        });

        return allTransactions;

    } catch (error) {
        console.error("Erro ao buscar transações:", error);
        alert("Ocorreu um erro ao carregar as transações. Verifique o console e a configuração do SheetsDB/Planilha.");
        return [];
    }
}


// --- 5. FUNÇÕES DE UI E CÁLCULOS ---

function addTransactionToDOM(transaction) {
    const listItem = document.createElement('li');
    listItem.classList.add(transaction.type);
    
    const sign = transaction.type === 'expense' ? '-' : '+';
    const amountClass = transaction.type === 'expense' ? 'negative' : 'positive';

    // Inclui o mês de referência na exibição
    listItem.innerHTML = `
        <span>${transaction.description} (${transaction.mesReferencia})</span> 
        <span class="${amountClass}">${sign} ${formatCurrency(transaction.amount)}</span>
        <button class="delete-btn" data-id="${transaction.id}" data-type="${transaction.type}">x</button>
    `;
    transactionsList.appendChild(listItem);

    listItem.querySelector('.delete-btn').addEventListener('click', async (e) => {
        const transactionId = e.target.dataset.id;
        const transactionType = e.target.dataset.type;

        try {
            await deleteTransactionFromSheetsDB(transactionId, transactionType);
            loadAndFilterTransactions(); // Recarrega e filtra após a deleção
        } catch (error) {
            console.error("Erro ao deletar transação no DOM:", error);
        }
    });
}

function updateSummary(transactionsToSum) { // Recebe as transações a serem somadas (filtradas)
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

// Função para carregar TODAS as transações e, em seguida, aplicar o filtro inicial
async function loadAndFilterTransactions() {
    allLoadedTransactions = await getAllTransactionsFromSheetsDB(); // Carrega TUDO

    // Seleciona o mês atual no seletor quando a página carrega, se for uma opção válida.
    // Isso garante que o filtro inicial seja sempre para o mês atual, se ele existir.
    const currentDate = new Date();
    // Formato MM/YYYY
    const currentMonthFormatted = `${(currentDate.getMonth() + 1).toString().padStart(2, '0')}/${currentDate.getFullYear()}`; 
    
    if (monthSelect.querySelector(`option[value="${currentMonthFormatted}"]`)) {
        monthSelect.value = currentMonthFormatted;
    } else {
        // Se o mês atual não for uma opção (ex: no início do projeto sem dados para o mês),
        // ou se não for encontrado no HTML, seleciona "Todos os Meses".
        monthSelect.value = 'all'; 
    }

    filterTransactionsByMonth(); // Aplica o filtro com o mês selecionado
}

// Função para filtrar e exibir transações com base no mês selecionado
function filterTransactionsByMonth() {
    const selectedMonthValue = monthSelect.value; // Valor do único seletor (MM/YYYY ou 'all')
    let filteredTransactions = [];

    if (selectedMonthValue === 'all') {
        filteredTransactions = allLoadedTransactions; // Exibe tudo
    } else {
        // Filtra transações onde 'mesReferencia' (que já está em MM/YYYY na planilha e normalizado)
        // corresponde ao valor selecionado no select.
        filteredTransactions = allLoadedTransactions.filter(t => 
            t.mesReferencia === selectedMonthValue
        );
    }

    transactionsList.innerHTML = ''; // Limpa a lista exibida

    if (filteredTransactions.length === 0) {
        console.log('Nenhuma transação encontrada para o mês selecionado.');
        updateSummary([]); // Atualiza o resumo com valores zero
        return;
    }

    // Ordena as transações filtradas por timestamp (mais recentes primeiro)
    filteredTransactions.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    // Adiciona as transações filtradas ao DOM
    filteredTransactions.forEach(transaction => {
        addTransactionToDOM(transaction);
    });
    updateSummary(filteredTransactions); // Atualiza o resumo APENAS com as transações filtradas
}

// --- 6. EVENT LISTENERS ---

// Listener para o evento de envio do formulário de transações
transactionForm.addEventListener('submit', async (e) => {
    e.preventDefault(); 

    const description = descriptionInput.value;
    const amount = parseFloat(amountInput.value);
    // Pega o mês de referência diretamente do ÚNICO seletor de mês (o que está sendo visualizado e filtrado)
    const mesReferencia = monthSelect.value; 
    const type = typeInput.value; 

    // Se o mês selecionado for "Todos os Meses", não podemos adicionar a ele, pois não é um mês específico.
    if (mesReferencia === 'all') {
        alert('Por favor, selecione um mês específico no campo "Mês de Referência" para adicionar a transação.');
        return;
    }

    if (description && amount && mesReferencia) {
        const newTransaction = {
            description,
            amount,
            type,
            mesReferencia, 
            timestamp: new Date().toISOString(), 
            id: generateUniqueId() 
        };

        try {
            await addTransactionToSheetsDB(newTransaction, type);
            console.log("Transação adicionada com sucesso no SheetsDB!");
            
            // Após adicionar, recarrega TUDO e aplica o filtro novamente (o mês selecionado permanece)
            await loadAndFilterTransactions(); 

            // Limpa o formulário para a próxima entrada
            descriptionInput.value = '';
            amountInput.value = '';
            // O seletor de mês não precisa ser resetado, pois ele mantém o mês selecionado
            typeInput.value = 'expense'; 
        } catch (error) {
            console.error("Erro ao adicionar transação ao SheetsDB:", error);
            alert("Ocorreu um erro ao adicionar a transação. Verifique o console.");
        }
    } else {
        alert('Por favor, preencha todos os campos (descrição, valor e mês).');
    }
});

// Listener para a mudança no ÚNICO seletor de mês
monthSelect.addEventListener('change', filterTransactionsByMonth);

// Carregar todas as transações e aplicar o filtro inicial ao iniciar a página
document.addEventListener('DOMContentLoaded', loadAndFilterTransactions);