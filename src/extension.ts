import * as vscode from 'vscode';
import * as fs from 'fs';
import pLimit from 'p-limit';

export function activate(context: vscode.ExtensionContext) {
    const todoProvider = new TodoProvider(vscode.workspace.rootPath || "");
    vscode.window.registerTreeDataProvider('todoView', todoProvider);

    let disposable = vscode.commands.registerCommand('extension.scanTODOs', () => {
        todoProvider.refresh();
    });

    context.subscriptions.push(disposable);
}

export function deactivate() {}

class TodoProvider implements vscode.TreeDataProvider<TodoItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<TodoItem | undefined | null | void> = new vscode.EventEmitter<TodoItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<TodoItem | undefined | null | void> = this._onDidChangeTreeData.event;

    constructor(private workspaceRoot: string) {}

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: TodoItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: TodoItem): Promise<TodoItem[]> {
        if (!this.workspaceRoot) {
            vscode.window.showInformationMessage('No workspace folder open');
            return Promise.resolve([]);
        }

        const config = vscode.workspace.getConfiguration('todo');
        const excludePatterns: string[] = config.get('exclude') || ['**/node_modules/**'];

        return this.getTodos(this.workspaceRoot, excludePatterns);
    }

    private async getTodos(dir: string, excludePatterns: string[]): Promise<TodoItem[]> {
        const todos: TodoItem[] = [];
        const files = await vscode.workspace.findFiles('**/*.{ts,js,jsx,tsx}', `{${excludePatterns.join(',')}}`);
        const limit = pLimit(10);  // Limit the number of concurrent file reads

        await Promise.all(files.map(file => limit(async () => {
            const content = await this.readFileAsync(file.fsPath);
            const regex = /\/\/\s*TODO:(.*)|{\/\*\s*TODO:(.*?)\*\/}/g;
            let match;
            while ((match = regex.exec(content)) !== null) {
                const todoText = match[1] ? match[1].trim() : match[2].trim();
                const todo = new TodoItem(todoText, vscode.TreeItemCollapsibleState.None, {
                    command: 'vscode.open',
                    title: '',
                    arguments: [file]
                });
                todos.push(todo);
            }
        })));

        return todos;
    }

    private readFileAsync(filePath: string): Promise<string> {
        return new Promise((resolve, reject) => {
            fs.readFile(filePath, 'utf8', (err, data) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(data);
                }
            });
        });
    }
}

class TodoItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly command?: vscode.Command
    ) {
        super(label, collapsibleState);
    }

    contextValue = 'todo';
}
