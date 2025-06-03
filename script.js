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

let editingTransactionId = null; // Variável para armazenar o ID da transação que está sendo editada
let isEditing = false; // Flag para controlar o modo de edição

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
            const jsDate = new Date(Math.round((excelDate - 25569) * 86400 * 1000));
            
            // Ajuste para o problema do ano bissexto de 1900 no Excel
            if (excelDate < 60) {
                // No adjustment needed
            } else if (excelDate === 60) {
                jsDate.setDate(jsDate.getDate() + 1);
            } else {
                jsDate.setDate(jsDate.getDate() + 1);
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
    bodyData.mesReferencia = transactionData.mesReferencia;

    if (type === 'income') {
        bodyData.valorEntrada = transactionData.amount;
        bodyData.valorSaida = ''; // Garante que a coluna de saída esteja vazia para receitas
    } else {
        bodyData.valorSaida = transactionData.amount;
        bodyData.valorEntrada = ''; // Garante que a coluna de entrada esteja vazia para despesas
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

// NOVO: Função para atualizar uma transação no SheetsDB
async function updateTransactionInSheetsDB(transactionData, oldType) {
    const targetSheet = transactionData.type === 'income' ? 'Receitas' : 'Despesas';
    // Se o tipo mudou (ex: de despesa para receita), precisamos deletar do antigo e adicionar no novo
    if (oldType && oldType !== transactionData.type) {
        // Primeiro, delete a transação da aba antiga
        await deleteTransactionFromSheetsDB(transactionData.id, oldType);
        // Depois, adicione-a na nova aba como se fosse uma nova transação
        await addTransactionToSheetsDB(transactionData, transactionData.type);
        console.log("Transação movida entre abas (tipo alterado) e atualizada.");
        return; // Sai da função, pois já foi tratada
    }

    // Se o tipo não mudou, apenas atualize na mesma aba
    const targetUrl = `${SHEETSDB_API_BASE_URL}?sheet=${targetSheet}&column=id&value=${transactionData.id}`;
    const bodyData = {};

    bodyData.descricao = transactionData.description;
    bodyData.timestamp = transactionData.timestamp; // Atualiza o timestamp para o momento da edição
    bodyData.mesReferencia = transactionData.mesReferencia;

    if (transactionData.type === 'income') {
        bodyData.valorEntrada = transactionData.amount;
        bodyData.valorSaida = '';
    } else {
        bodyData.valorSaida = transactionData.amount;
        bodyData.valorEntrada = '';
    }

    try {
        const response = await fetch(targetUrl, {
            method: 'PUT', // Método PUT para atualização
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(bodyData),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Erro ao atualizar: ${response.status} - ${errorText}`);
        }

        const result = await response.json();
        console.log("Transação atualizada com sucesso no SheetsDB!", result);
        return result;
    } catch (error) {
        console.error("Erro na requisição PUT para SheetsDB:", error);
        alert("Ocorreu um erro ao atualizar a transação. Verifique o console.");
        throw error;
    }
}


// Função para deletar uma transação do SheetsDB
async function deleteTransactionFromSheetsDB(id, type) {
    const targetSheet = type === 'income' ? 'Receitas' : 'Despesas';
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
        console.log("Dados de Receitas Brutos:", incomeData);
        const incomes = incomeData.map(item => ({
            description: item.descricao,
            amount: parseFloat(item.valorEntrada),
            type: 'income',
            mesReferencia: normalizeMmYyyy(item.mesReferencia),
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
        console.log("Dados de Despesas Brutos:", expenseData);
        const expenses = expenseData.map(item => ({
            description: item.descricao,
            amount: parseFloat(item.valorSaida),
            type: 'expense',
            mesReferencia: normalizeMmYyyy(item.mesReferencia),
            timestamp: item.timestamp,
            id: item.id
        }));
        allTransactions = allTransactions.concat(expenses);

        // Ordena todas as transações combinadas por mesReferencia e depois por timestamp
        allTransactions.sort((a, b) => {
            const [monthA, yearA] = a.mesReferencia.split('/');
            const mesAnoNumA = parseInt(yearA) * 100 + parseInt(monthA);

            const [monthB, yearB] = b.mesReferencia.split('/');
            const mesAnoNumB = parseInt(yearB) * 100 + parseInt(monthB);

            if (mesAnoNumA === mesAnoNumB) {
                return new Date(b.timestamp) - new Date(a.timestamp);
            }
            return mesAnoNumB - mesAnoNumA;
        });

        console.log("Todas as transações carregadas e processadas:", allTransactions);
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
        <div class="transaction-actions">
            <button class="edit-btn" data-id="${transaction.id}" data-type="${transaction.type}">Editar</button>
            <button class="delete-btn" data-id="${transaction.id}" data-type="${transaction.type}">x</button>
        </div>
    `;
    transactionsList.appendChild(listItem);

    // Adiciona listener para o botão de deletar
    listItem.querySelector('.delete-btn').addEventListener('click', async (e) => {
        const transactionId = e.target.dataset.id;
        const transactionType = e.target.dataset.type;

        if (confirm("Tem certeza que deseja deletar esta transação?")) {
            try {
                await deleteTransactionFromSheetsDB(transactionId, transactionType);
                console.log("Transação deletada do SheetsDB, recarregando DOM...");
                if (window.location.pathname.includes('view.html')) {
                    loadAndFilterTransactionsViewPage();
                } else if (window.location.pathname.includes('add.html')) {
                    loadAllTransactionsAddPage();
                }
            } catch (error) {
                console.error("Erro ao deletar transação no DOM:", error);
            }
        }
    });

    // NOVO: Adiciona listener para o botão de editar
    listItem.querySelector('.edit-btn').addEventListener('click', (e) => {
        const transactionId = e.target.dataset.id;
        const transactionToEdit = allLoadedTransactions.find(t => t.id === transactionId);

        if (transactionToEdit) {
            setupEditMode(transactionToEdit);
        } else {
            console.error("Transação não encontrada para edição:", transactionId);
            alert("Erro: Transação não encontrada para edição.");
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

// NOVO: Função para configurar o formulário para modo de edição
function setupEditMode(transaction) {
    if (!transactionForm || !descriptionInput || !amountInput || !monthSelectAdd || !typeInput) {
        alert("Erro: Elementos do formulário não encontrados para edição.");
        return;
    }

    // Preenche o formulário com os dados da transação
    descriptionInput.value = transaction.description;
    amountInput.value = transaction.amount;
    monthSelectAdd.value = transaction.mesReferencia;
    typeInput.value = transaction.type;

    // Altera o texto do botão e a flag de edição
    const submitButton = transactionForm.querySelector('button[type="submit"]');
    submitButton.textContent = 'Salvar Edição';
    isEditing = true;
    editingTransactionId = transaction.id;

    // Armazena o tipo original para verificar se a transação precisa ser movida
    transactionForm.dataset.originalType = transaction.type; 

    // Opcional: Rolagem suave para o formulário
    transactionForm.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// NOVO: Função para resetar o formulário para modo de adição
function resetAddMode() {
    transactionForm.reset(); // Limpa todos os campos do formulário
    const submitButton = transactionForm.querySelector('button[type="submit"]');
    submitButton.textContent = 'Adicionar';
    isEditing = false;
    editingTransactionId = null;
    transactionForm.dataset.originalType = ''; // Limpa o tipo original
}


// --- 6. LÓGICA ESPECÍFICA PARA CADA PÁGINA ---

// --- Lógica para add.html ---
async function setupAddPage() {
    transactionForm = document.getElementById('transaction-form');
    descriptionInput = document.getElementById('description');
    amountInput = document.getElementById('amount');
    monthSelectAdd = document.getElementById('month-select-add');
    typeInput = document.getElementById('type');
    
    // Adicione um botão para "Cancelar Edição" no add.html se estiver em modo de edição
    const cancelButton = document.createElement('button');
    cancelButton.type = 'button';
    cancelButton.textContent = 'Cancelar Edição';
    cancelButton.style.display = 'none'; // Esconde inicialmente
    cancelButton.addEventListener('click', resetAddMode);
    transactionForm.appendChild(cancelButton);


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
        const mesReferencia = monthSelectAdd.value;
        const type = typeInput.value; 

        if (!mesReferencia) {
            alert('Por favor, selecione um mês de referência.');
            return;
        }

        if (description && amount) {
            const transactionData = {
                description,
                amount,
                type,
                mesReferencia: normalizeMmYyyy(mesReferencia),
                timestamp: new Date().toISOString(),
                id: editingTransactionId || generateUniqueId() // Usa ID existente se estiver editando
            };
            console.log("Dados da transação para processamento:", transactionData);

            try {
                if (isEditing) {
                    const originalType = transactionForm.dataset.originalType;
                    await updateTransactionInSheetsDB(transactionData, originalType);
                    alert("Transação atualizada com sucesso!");
                    resetAddMode(); // Reseta o formulário após a edição
                } else {
                    await addTransactionToSheetsDB(transactionData, type);
                    alert("Transação adicionada com sucesso!");
                }
                
                // Recarrega as transações para atualizar a lista e o resumo
                if (transactionsList) {
                    loadAllTransactionsAddPage(); 
                }
            } catch (error) {
                console.error("Erro ao processar transação:", error);
                alert("Ocorreu um erro ao processar a transação. Verifique o console.");
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
        monthSelectAdd.value = ''; 
    }
}

// Carrega todas as transações para exibição na página de adição (se aplicável)
async function loadAllTransactionsAddPage() {
    if (!transactionsList) return;
    
    transactionsList.innerHTML = ''; 
    totalIncome = 0; 
    totalExpense = 0;

    allLoadedTransactions = await getAllTransactionsFromSheetsDB();

    if (allLoadedTransactions.length === 0) {
        console.log('Nenhuma transação encontrada para exibição na página de adição.');
        updateSummary([]);
        return;
    }

    allLoadedTransactions.forEach(transaction => {
        addTransactionToDOM(transaction);
    });
    updateSummary(allLoadedTransactions);
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
    allLoadedTransactions = await getAllTransactionsFromSheetsDB();

    const currentDate = new Date();
    const currentMonthFormatted = `${(currentDate.getMonth() + 1).toString().padStart(2, '0')}/${currentDate.getFullYear()}`; 
    
    if (monthSelectView.querySelector(`option[value="${currentMonthFormatted}"]`)) {
        monthSelectView.value = currentMonthFormatted;
    } else {
        monthSelectView.value = 'all';
    }

    filterTransactionsByMonth();
}

function filterTransactionsByMonth() {
    const selectedMonthValue = monthSelectView.value;
    let filteredTransactions = [];

    console.log("Mês selecionado no filtro (view.html):", selectedMonthValue);
    console.log("Todas as transações disponíveis para filtrar:", allLoadedTransactions);

    if (selectedMonthValue === 'all') {
        filteredTransactions = allLoadedTransactions;
    } else {
        filteredTransactions = allLoadedTransactions.filter(t => {
            const match = t.mesReferencia === selectedMonthValue;
            return match;
        });
    }

    console.log("Transações FILTRADAS para exibição:", filteredTransactions);

    transactionsList.innerHTML = '';

    if (filteredTransactions.length === 0) {
        console.log('Nenhuma transação encontrada para o mês selecionado.');
        updateSummary([]);
        return;
    }

    filteredTransactions.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    filteredTransactions.forEach(transaction => {
        addTransactionToDOM(transaction);
    });
    updateSummary(filteredTransactions);
}


// --- 7. INICIALIZAÇÃO COM BASE NA PÁGINA ATUAL ---

document.addEventListener('DOMContentLoaded', () => {
    const path = window.location.pathname;

    if (path.includes('add.html')) {
        setupAddPage();
    } else if (path.includes('view.html')) {
        setupViewPage();
    } else {
        console.log("Página inicial ou desconhecida. Nenhuma lógica específica do script.js aqui.");
    }
});