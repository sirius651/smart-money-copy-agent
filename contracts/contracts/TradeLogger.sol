// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title TradeLogger
/// @notice On-chain audit trail for the Smart Money Agent's trade decisions on X Layer testnet.
///         Each call to logTrade() records a trade (real or simulated) emitted as an event
///         and stored in contract state, giving the hackathon demo verifiable on-chain proof.
contract TradeLogger {
    struct TradeRecord {
        string  tokenSymbol;
        string  chain;
        string  action;        // "buy" | "sell"
        uint256 amountUsdCents; // USD * 100  (e.g. $12.50 → 1250)
        uint256 confidenceScore; // 0-100
        string  status;        // "executed" | "simulated" | "failed"
        uint256 timestamp;     // block.timestamp
    }

    TradeRecord[] private _trades;
    address public immutable owner;

    event TradeLogged(
        uint256 indexed id,
        string  tokenSymbol,
        string  action,
        uint256 amountUsdCents,
        uint256 confidenceScore,
        string  status,
        uint256 timestamp
    );

    error Unauthorized();

    constructor() {
        owner = msg.sender;
    }

    /// @notice Record a trade decision. Can be called by any address (agent wallet).
    function logTrade(
        string calldata tokenSymbol,
        string calldata chain,
        string calldata action,
        uint256 amountUsdCents,
        uint256 confidenceScore,
        string calldata status
    ) external returns (uint256 id) {
        id = _trades.length;
        _trades.push(TradeRecord({
            tokenSymbol:     tokenSymbol,
            chain:           chain,
            action:          action,
            amountUsdCents:  amountUsdCents,
            confidenceScore: confidenceScore,
            status:          status,
            timestamp:       block.timestamp
        }));

        emit TradeLogged(id, tokenSymbol, action, amountUsdCents, confidenceScore, status, block.timestamp);
    }

    /// @notice Total number of trades logged.
    function tradeCount() external view returns (uint256) {
        return _trades.length;
    }

    /// @notice Fetch a single trade record by index.
    function getTrade(uint256 id) external view returns (TradeRecord memory) {
        require(id < _trades.length, "TradeLogger: id out of range");
        return _trades[id];
    }

    /// @notice Fetch the latest N trades (most recent first).
    function getRecentTrades(uint256 n) external view returns (TradeRecord[] memory) {
        uint256 total = _trades.length;
        uint256 count = n > total ? total : n;
        TradeRecord[] memory result = new TradeRecord[](count);
        for (uint256 i = 0; i < count; i++) {
            result[i] = _trades[total - 1 - i];
        }
        return result;
    }
}
