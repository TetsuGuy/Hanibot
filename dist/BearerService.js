class BearerTokenManager {
    constructor(initialTokens) {
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
