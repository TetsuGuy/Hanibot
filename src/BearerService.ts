class BearerTokenManager {
    tokens: string[];
    currentTokenIndex: number;
    constructor(initialTokens: string[]) {
        this.tokens = initialTokens;
        this.currentTokenIndex = 0;
    }

    getCurrentToken() {
        return this.tokens[this.currentTokenIndex];
    }

    nextToken() {
        this.currentTokenIndex = (this.currentTokenIndex + 1) % this.tokens.length;
    }
}

export default BearerTokenManager;