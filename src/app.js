import axios from "axios";
import Alpine from "alpinejs";
import { Howl } from 'howler';
import { Chess, SQUARES } from "chess.js";
import { Chessground } from "chessground";
import { resizeHandle } from "./resize.js";

import SoundMoveOGG from "url:./sound/LichessMove.ogg";
import SoundMoveMP3 from "url:./sound/LichessMove.mp3";
import SoundCaptureOGG from "url:./sound/LichessCapture.ogg";
import SoundCaptureMP3 from "url:./sound/LichessCapture.mp3";
import SoundGenericNotifyOGG from "url:./sound/LichessGenericNotify.ogg";
import SoundGenericNotifyMP3 from "url:./sound/LichessGenericNotify.mp3";

const DEFAULT_POSITION = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

const SoundMove = new Howl({ src: [ SoundMoveOGG, SoundMoveMP3 ] });
const SoundCapture = new Howl({ src: [ SoundCaptureOGG, SoundCaptureMP3 ] });
const SoundGenericNotify = new Howl({ src: [ SoundGenericNotifyOGG, SoundGenericNotifyMP3 ] });

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

function playOtherSide(cg, chess) {
    return async (orig, dest) => {
        // should trigger promotion?
        let promotion = undefined;
        if (chess.get(orig)["type"] === "p" && "18".includes(dest[1])) {
            Alpine.store("state").isPromoting = true;
            promotion = await startPromotion(dest);
            Alpine.store("state").isPromoting = false;
        }

        chess.move({from: orig, to: dest, promotion: promotion});

        if (Alpine.store("settings").enableSounds) {
            const san = chess.history().pop();
            san.includes("x") ? SoundCapture.play() : SoundMove.play();
        }

        cg.set({
            fen: chess.fen(),
            turnColor: toColor(chess),
            check: chess.in_check(),
            movable: {
                color: toColor(chess),
                dests: toDests(chess)
            }
        });
        Alpine.store("state").updateState();
        Alpine.store("settings").startingFEN = chess.fen();
    };
}

function startPromotion(square) {
    return new Promise((resolve, reject) => {
        Alpine.store("state").promotionColor = toColor(chess);

        if (Alpine.store("settings").playerColor === "white") {
            const column = "abcdefgh".indexOf(square[0]);
            Alpine.store("state").promotionLeft = (column * 12.5).toString() + "%";
        } else {
            const column = "hgfedcba".indexOf(square[0]);
            Alpine.store("state").promotionLeft = (column * 12.5).toString() + "%";
        }

        if (Alpine.store("settings").playerColor === toColor(chess)) {
            Alpine.store("state").promotionTop = ["0%", "12.5%", "25%", "37.5%"];
        } else {
            Alpine.store("state").promotionTop = ["87.5%", "75%", "62.5%", "50%"];
        }

        Alpine.store("state").promotionResolve = resolve;
    });
}

function lichessOpeningPlay(cg, chess, delay = 0) {
    return async (orig, dest) => {
        if (Alpine.store("state").lockLichessOpeningPlay) {
            return;
        }
        Alpine.store("state").lockLichessOpeningPlay = true;

        // there's a player move
        if (orig && dest) {
            // should trigger promotion?
            let promotion = undefined;
            if (chess.get(orig)["type"] === "p" && "18".includes(dest[1])) {
                Alpine.store("state").isPromoting = true;
                promotion = await startPromotion(dest);
                Alpine.store("state").isPromoting = false;
                if (promotion === false) {
                    // can't unlock here for some reason, must be from the caller of reject
                    return;
                }
            }

            chess.move({from: orig, to: dest, promotion: promotion});

            if (Alpine.store("settings").enableSounds) {
                const san = chess.history().pop();
                san.includes("x") ? SoundCapture.play() : SoundMove.play();
            }

            cg.set({ fen: chess.fen(), check: chess.in_check() });
            Alpine.store("state").updateState();
        }

        Alpine.store("state").isThinking = true;

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

            if (Alpine.store("settings").enableSounds) {
                const san = chess.history().pop();
                san.includes("x") ? SoundCapture.play() : SoundMove.play();
            }

            cg.set({
                fen: chess.fen(),
                turnColor: toColor(chess),
                check: chess.in_check(),
                movable: {
                    color: toColor(chess),
                    dests: toDests(chess)
                }
            });
            Alpine.store("state").updateState();
        } else {
            if (Alpine.store("settings").enableSounds) {
                SoundGenericNotify.play();
            }
            Alpine.store("state").noGameFound = true;
        }
        Alpine.store("state").isThinking = false;
        Alpine.store("state").lockLichessOpeningPlay = false;
    };
}

const chess = Chess();
const config = {
    coordinates: false,
    disableContextMenu: true,
    addDimensionsCssVarsTo: document.getElementsByTagName("body")[0],
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
    allowDrawing: true,
    enableSounds: true,

    startingFEN: DEFAULT_POSITION,
    isSettingUpBoard: false,

    toggleSettings() {
        this.showSettings = !this.showSettings;
        ground.redrawAll();
    },

    async selectColor(color) {

        if (Alpine.store("state").isPromoting) {
            Alpine.store("state").promotionResolve(false);
            Alpine.store("state").isPromoting = false;
            Alpine.store("state").lockLichessOpeningPlay = false;
        }

        this.playerColor = color;

        ground.set({
            fen:chess.fen(),
            turnColor: toColor(chess),
            orientation: this.playerColor,
            movable: {
                color: undefined,
                dests: undefined,
            }
        });

        if (this.isSettingUpBoard || this.playerColor === toColor(chess)) {
            ground.set({
                movable: {
                    color: toColor(chess),
                    dests: toDests(chess),
                }
            });
        } else {
            await lichessOpeningPlay(ground, chess, 500)();
        }
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

    toggleAllowDrawing() {
        this.allowDrawing = !this.allowDrawing;
        ground.set({ drawable: {
            enabled: this.allowDrawing,
            visible: this.allowDrawing,
        }});
        ground.redrawAll();
    },

    toggleEnableSounds() {
        this.enableSounds = !this.enableSounds;
    },

    resetStartingFENtoDefault() {
        this.startingFEN = DEFAULT_POSITION;
    },

    toggleSetupBoard() {

        if (Alpine.store("state").isPromoting) {
            Alpine.store("state").promotionResolve(false);
            Alpine.store("state").isPromoting = false;
            Alpine.store("state").lockLichessOpeningPlay = false;
        }

        ground.set({
            fen:chess.fen(),
            turnColor: toColor(chess),
        });

        this.isSettingUpBoard = !this.isSettingUpBoard;

        if (this.isSettingUpBoard) {
            ground.set({
                movable: {
                    color: toColor(chess),
                    dests: toDests(chess),
                    events: { after: playOtherSide(ground, chess) },
                }
            });
            this.startingFEN = chess.fen();
            Alpine.store("state").noGameFound = false;
        } else if (Alpine.store("settings").playerColor === toColor(chess)) {
            ground.set({
                movable: {
                    color: toColor(chess),
                    dests: toDests(chess),
                    events: { after: lichessOpeningPlay(ground, chess, 500) },
                }
            });
        } else {
            ground.set({
                movable: {
                    color: undefined,
                    dests: undefined,
                    events: { after: lichessOpeningPlay(ground, chess, 500) }
                }
            });
            lichessOpeningPlay(ground, chess, 500)();
        }
    }

});

Alpine.store("state", {
    pgn: "",
    fen: chess.fen(),
    noGameFound: false,
    isThinking: false,
    isPromoting: false,
    promotionColor: undefined,
    promotionResolve: undefined,
    promotionLeft: "0%",
    promotionTop: ["0%", "0%", "0%", "0%"],
    lockLichessOpeningPlay: false,

    updateState() {
        this.pgn = chess.pgn({ max_width: 12 });
        this.fen = chess.fen();
    },

    async resetState() {
        Alpine.store("settings").isSettingUpBoard = false;

        const startingFEN = Alpine.store("settings").startingFEN;
        const playerColor = Alpine.store("settings").playerColor;

        chess.reset();
        const success = chess.load(startingFEN);
        if (!success) {
            Alpine.store("settings").startingFEN = DEFAULT_POSITION;
        }

        this.pgn = "";
        this.fen = chess.fen();
        this.noGameFound = false;
        ground.set({
            fen: this.fen,
            turnColor: toColor(chess),
            lastMove: undefined,
            check: chess.in_check(),
            selected: undefined,
            movable: {
                color: undefined,
                dests: undefined,
            }
        });

        if (playerColor === toColor(chess)) {
            ground.set({
                movable: {
                    color: toColor(chess),
                    dests: toDests(chess),
                    events: { after: lichessOpeningPlay(ground, chess, 500) },
                }
            });
        } else {
            await lichessOpeningPlay(ground, chess, 500)();
        }
    },

    undoLastMove() {
        chess.undo();
        this.updateState();
        Alpine.store("settings").startingFEN = chess.fen();
        ground.set({
            fen: this.fen,
            turnColor: toColor(chess),
            check: chess.in_check(),
            lastMove: undefined,
            selected: undefined,
            movable: {
                color: toColor(chess),
                dests: toDests(chess)
            }
        });
    },

    async copyPGNtoClipboard() {
        await navigator.clipboard.writeText(this.pgn);
    },

    async copyFENtoClipboard() {
        await navigator.clipboard.writeText(this.fen);
    },

    getLichessAnalysisURL() {
        const playerColor = Alpine.store("settings").playerColor;
        return "https://lichess.org/analysis/pgn/" + encodeURIComponent(this.pgn.replaceAll("\n", " ")) + "?color=" + playerColor;
    },

    async onPasteFEN() {
        if (this.fen === chess.fen())
            return;

        const success = chess.load(this.fen);
        if (!success) {
            this.fen = 'Invalid FEN';
            return;
        }

        if (Alpine.store("state").isPromoting) {
            Alpine.store("state").promotionResolve(false);
            Alpine.store("state").isPromoting = false;
            Alpine.store("state").lockLichessOpeningPlay = false;
        }

        this.pgn = "";
        this.noGameFound = false;
        ground.set({
            fen: this.fen,
            check: chess.in_check(),
            turnColor: toColor(chess),
            lastMove: undefined,
            selected: undefined,
            movable: {
                color: undefined,
                dests: undefined,
            }
        });

        if (Alpine.store("settings").playerColor === toColor(chess)) {
            ground.set({
                movable: {
                    color: toColor(chess),
                    dests: toDests(chess),
                }
            });
        } else {
            await lichessOpeningPlay(ground, chess, 500)();
        }
    }
})

Alpine.start();
