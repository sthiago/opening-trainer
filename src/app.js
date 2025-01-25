import axios from "axios";
import Alpine from "alpinejs";
import { Chess, SQUARES } from "chess.js";
import { Chessground } from "chessground";
import { resizeHandle } from "./resize.js";


function toDests(chess) {
    const dests = new Map();
    SQUARES.forEach(s => {
        const ms = chess.moves({square: s, verbose: true});
        if (ms.length) dests.set(s, ms.map(m => m.to));
    });
    return dests;
}

function toColor(chess) {
    return (chess.turn() === 'w') ? 'white' : 'black';
}

function sleep(delay) {
    return new Promise((resolve) => setTimeout(resolve, delay))
}

function getWeightedRandomMove(data) {
    const total = data.moves.reduce((prev, curr) => prev + curr.white + curr.black + curr.draws, 0);

    for (let i = 0; i < data.moves.length; i++) {
        const move = data.moves[i]
        move.total = move.white + move.black + move.draws;
        move.percentage = move.total / total;
        move.cumulativePercentage = i > 0 ? move.percentage + data.moves[i-1].cumulativePercentage : move.percentage;
        move.from = move.uci.slice(0, 2);
        move.to = move.uci.slice(2, 4);
    }

    const roll = Math.random();
    let selectedMove;
    for (const move of data.moves) {
        if (roll <= move.cumulativePercentage) {
            selectedMove = move;
            break;
        }
    }

    return selectedMove;
}

function lichessOpeningPlay(cg, chess, delay = 0) {
    return async (orig, dest) => {
        chess.move({from: orig, to: dest});
        cg.set({ check: chess.in_check() });
        Alpine.store("state").updateState();

        const database = Alpine.store("settings").selectedDatabase;
        const speeds = Alpine.store("settings").selectedTimeControls.join(",");
        const ratings = Alpine.store("settings").selectedRatings.join(",");
        const explorerUrl = `https://explorer.lichess.ovh/${database}?variant=standard&fen=${chess.fen()}` + (database === "lichess" ? `&speeds=${speeds}&ratings=${ratings}` : "");

        const response = await axios.get(explorerUrl);
        const move = getWeightedRandomMove(response.data);
        if (move !== undefined) {
            await sleep(delay);
            chess.move(move.san);
            cg.move(move.from, move.to);
            cg.set({
                turnColor: toColor(chess),
                check: chess.in_check(),
                movable: {
                    color: toColor(chess),
                    dests: toDests(chess)
                }
            });
            cg.playPremove();
            Alpine.store("state").updateState();
        } else {
            Alpine.store("state").noGameFound = true;
        }
    };
}

const chess = Chess();
const config = {
    coordinates: false,
    disableContextMenu: true,
    movable: {
        color: "white",
        free: false,
        dests: toDests(chess),
        showDests: true,
    },
    highlight: {
        lastMove: true,
        check: true,
    },
    premovable: {
        enabled: false,
    },
    drawable: {
        enabled: true,
    },
    events: {
        insert(elements) { resizeHandle(elements); }
    }
};

const ground = Chessground(document.getElementById("chessground"), config);

ground.set({
    movable: {
        events: {
            after: lichessOpeningPlay(ground, chess, 500)
        }
    }
});


Alpine.store("settings", {
    showSettings: false,
    playerColor: "white",
    selectedDatabase: "lichess",
    selectedTimeControls: [ "blitz", "rapid", "classical" ],
    selectedRatings: [ "1600", "1800", "2000" ],

    showCoordinates: false,
    showPossibleMoves: true,
    highlightLastMove: true,
    highlightChecks: true,
    allowPremoves: false,
    allowDrawing: true,

    toggleSettings() {
        this.showSettings = !this.showSettings;
        ground.redrawAll();
    },

    async selectColor(color) {
        this.playerColor = color;

        ground.set({
            orientation: this.playerColor
        });

        if (ground.state.orientation != ground.state.turnColor) {
            await lichessOpeningPlay(ground, chess, 500)()
        }
        ground.redrawAll();
    },

    selectDatabase(database) {
        this.selectedDatabase = database;
        ground.redrawAll();
    },

    toggleTimeControl(timeControl) {
        const index = this.selectedTimeControls.indexOf(timeControl);
        if (index > -1) {
            this.selectedTimeControls.splice(index, 1);
        } else {
            this.selectedTimeControls.push(timeControl);
        }
        ground.redrawAll();
    },

    toggleRating(rating) {
        const index = this.selectedRatings.indexOf(rating);
        if (index > -1) {
            this.selectedRatings.splice(index, 1);
        } else {
            this.selectedRatings.push(rating);
        }
        ground.redrawAll();
    },

    toggleShowCoordinates() {
        this.showCoordinates = !this.showCoordinates;
        ground.set({ coordinates: this.showCoordinates });
        ground.redrawAll();
    },

    toggleShowPossibleMoves() {
        this.showPossibleMoves = !this.showPossibleMoves;
        ground.set({ movable: { showDests: this.showPossibleMoves } });
        ground.redrawAll();
    },

    toggleHighlightLastMove() {
        this.highlightLastMove = !this.highlightLastMove;
        ground.set({ highlight: { lastMove: this.highlightLastMove } });
        ground.redrawAll();
    },

    toggleHighlightChecks() {
        this.highlightChecks = !this.highlightChecks;
        ground.set({ highlight: { check: this.highlightChecks } });
        ground.redrawAll();
    },

    toggleAllowPremoves() {
        this.allowPremoves = !this.allowPremoves;
        ground.set({ premovable: { enabled: this.allowPremoves } });
        ground.redrawAll();
    },

    toggleAllowDrawing() {
        this.allowDrawing = !this.allowDrawing;
        ground.set({ drawable: {
            enabled: this.allowDrawing,
            visible: this.allowDrawing,
        }});
        ground.redrawAll();
    }

});

Alpine.store("state", {
    pgn: "",
    fen: chess.fen(),
    noGameFound: false,

    updateState() {
        this.pgn = chess.pgn({ max_width: 12 });
        this.fen = chess.fen();
    },

    async resetState() {
        chess.reset();
        this.pgn = "";
        this.fen = chess.fen();
        this.noGameFound = false;
        ground.set({
            fen: this.fen,
            turnColor: toColor(chess),
            check: chess.in_check(),
            movable: {
                color: toColor(chess),
                dests: toDests(chess)
            }
        });

        if (ground.state.orientation != ground.state.turnColor) {
            await lichessOpeningPlay(ground, chess, 500)()
        }
    },

    pgnHTML() {
        let movelist = "<div>" + this.pgn.split("\n").toReversed().join("</div><div>") + "</div>";
        if (this.noGameFound) movelist = "<div class='m-2 font-bold'>No game found</div>" + movelist;
        movelist = "<div class='grow'></div>" + movelist
        return movelist;
    },

    async copyPGNtoClipboard() {
        await navigator.clipboard.writeText(this.pgn);
    },

    async copyFENtoClipboard() {
        await navigator.clipboard.writeText(this.fen);
    },

    getLichessAnalysisURL() {
        return "https://lichess.org/analysis/pgn/" + this.pgn.replaceAll("\n", " ");
    },

    async onPasteFEN() {
        if (this.fen === chess.fen())
            return;

        const success = chess.load(this.fen);

        if (!success) {
            this.fen = 'Invalid FEN';
            return;
        }

        this.pgn = "";
        this.noGameFound = false;
        ground.set({
            fen: this.fen,
            turnColor: toColor(chess),
            check: chess.in_check(),
            movable: {
                color: toColor(chess),
                dests: toDests(chess)
            }
        });
        Alpine.store("settings").selectColor(toColor(chess));
    }
})
Alpine.start();
