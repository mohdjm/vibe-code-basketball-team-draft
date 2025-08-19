import React, { useState, useEffect } from "react";
import { Player } from "@/entities/Player";
import { Button } from "@/components/ui/button";
import { ArrowLeft, RotateCcw } from "lucide-react";
import GameFormatSelector from "../components/GameFormatSelector";
import PlayerInput from "../components/PlayerInput";
import SpinningWheel from "../components/SpinningWheel";
import TeamDisplay from "../components/TeamDisplay";

export default function BasketballDrafter() {
  const [gameFormat, setGameFormat] = useState("");
  const [sessionId] = useState(`session_${Date.now()}`);
  const [players, setPlayers] = useState([]);
  const [availablePlayers, setAvailablePlayers] = useState([]);
  const [teams, setTeams] = useState([]);
  const [currentPhase, setCurrentPhase] = useState("format"); // format, players, draft, results
  const [isSpinning, setIsSpinning] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [draftComplete, setDraftComplete] = useState(false);

  useEffect(() => {
    if (gameFormat) {
      loadPlayers();
    }
  }, [gameFormat, sessionId]);

  const loadPlayers = async () => {
    try {
      const allPlayers = await Player.filter({ 
        draft_session_id: sessionId,
        is_drafted: false 
      });
      setPlayers(allPlayers);
      setAvailablePlayers(allPlayers);
    } catch (error) {
      console.error("Error loading players:", error);
    }
  };

  const handleFormatSelect = (format) => {
    setGameFormat(format);
    const teamCount = format === "3v3" ? 2 : 2; // Always 2 teams for simplicity
    const emptyTeams = Array.from({ length: teamCount }, () => []);
    setTeams(emptyTeams);
  };

  const balanceTeams = (playersList, teamCount, playersPerTeam) => {
    // Simple balancing algorithm: distribute by skill tier
    const skillValues = { "Rookie": 1, "Amateur": 2, "Pro": 3, "Elite": 4, "Legend": 5 };
    const sortedPlayers = [...playersList].sort((a, b) => skillValues[b.skill_tier] - skillValues[a.skill_tier]);
    
    const balancedTeams = Array.from({ length: teamCount }, () => []);
    
    // Snake draft pattern
    let teamIndex = 0;
    let direction = 1;
    
    sortedPlayers.forEach((player) => {
      balancedTeams[teamIndex].push(player);
      
      if (direction === 1 && teamIndex === teamCount - 1) {
        direction = -1;
      } else if (direction === -1 && teamIndex === 0) {
        direction = 1;
      } else {
        teamIndex += direction;
      }
    });
    
    return balancedTeams;
  };

  const handlePlayerSelected = async (player) => {
    setIsSpinning(false);
    setSelectedPlayer(player);
    
    // Remove player from available pool
    const newAvailablePlayers = availablePlayers.filter(p => p.id !== player.id);
    setAvailablePlayers(newAvailablePlayers);
    
    // Update player as drafted
    try {
      await Player.update(player.id, { 
        is_drafted: true,
        team_assigned: `team_${teams.findIndex(team => team.length < parseInt(gameFormat.charAt(0))) + 1}`
      });
    } catch (error) {
      console.error("Error updating player:", error);
    }
    
    // Add to appropriate team
    const newTeams = [...teams];
    const targetTeam = newTeams.find(team => team.length < parseInt(gameFormat.charAt(0)));
    if (targetTeam) {
      targetTeam.push(player);
    }
    setTeams(newTeams);
    
    // Check if draft is complete
    const totalPlayers = parseInt(gameFormat.charAt(0)) * newTeams.length;
    const draftedPlayers = newTeams.reduce((sum, team) => sum + team.length, 0);
    
    if (draftedPlayers >= totalPlayers || newAvailablePlayers.length === 0) {
      setDraftComplete(true);
      setCurrentPhase("results");
    }
    
    // Clear selection after 3 seconds
    setTimeout(() => {
      setSelectedPlayer(null);
    }, 3000);
  };

  const handleSpin = () => {
    if (availablePlayers.length === 0) return;
    setIsSpinning(true);
    setSelectedPlayer(null);
  };

  const handleReshuffle = async () => {
    try {
      // Reset all players
      const allSessionPlayers = await Player.filter({ draft_session_id: sessionId });
      for (const player of allSessionPlayers) {
        await Player.update(player.id, { 
          is_drafted: false, 
          team_assigned: null 
        });
      }
      
      // Redistribute players using balancing algorithm
      const playersPerTeam = parseInt(gameFormat.charAt(0));
      const availableForRedraft = players.slice(0, playersPerTeam * teams.length);
      const balancedTeams = balanceTeams(availableForRedraft, teams.length, playersPerTeam);
      
      setTeams(balancedTeams);
      setAvailablePlayers([]);
      setDraftComplete(true);
      setCurrentPhase("results");
    } catch (error) {
      console.error("Error reshuffling teams:", error);
    }
  };

  const handleExport = () => {
    const csvContent = teams.map((team, index) => 
      team.map(player => `Team ${index + 1},${player.name},${player.skill_tier}`).join('\n')
    ).join('\n');
    
    const blob = new Blob([`Team,Player,Skill Tier\n${csvContent}`], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `basketball_teams_${gameFormat}_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  const handleRestart = async () => {
    // Clean up session
    try {
      const allSessionPlayers = await Player.filter({ draft_session_id: sessionId });
      for (const player of allSessionPlayers) {
        await Player.delete(player.id);
      }
    } catch (error) {
      console.error("Error cleaning up session:", error);
    }
    
    // Reset state
    setGameFormat("");
    setPlayers([]);
    setAvailablePlayers([]);
    setTeams([]);
    setCurrentPhase("format");
    setIsSpinning(false);
    setSelectedPlayer(null);
    setDraftComplete(false);
  };

  const canProceedToDraft = players.length >= (parseInt(gameFormat?.charAt(0) || "3") * 2);

  return (
    <div className="min-h-screen bg-gradient-to-br from-yellow-200 via-orange-100 to-red-200 p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          {currentPhase !== "format" && (
            <Button
              onClick={handleRestart}
              className="bg-gray-500 hover:bg-gray-600 text-white border-3 border-black shadow-[4px_4px_0px_#000] font-black transform -rotate-1"
            >
              <ArrowLeft size={20} className="mr-2" />
              START OVER
            </Button>
          )}
          <div className="flex-1"></div>
        </div>

        {/* Format Selection */}
        {currentPhase === "format" && (
          <GameFormatSelector 
            onFormatSelect={(format) => {
              handleFormatSelect(format);
              setCurrentPhase("players");
            }}
            selectedFormat={gameFormat}
          />
        )}

        {/* Player Input Phase */}
        {currentPhase === "players" && (
          <div className="space-y-8">
            <PlayerInput
              sessionId={sessionId}
              onPlayersUpdate={loadPlayers}
              currentPlayers={players}
            />
            
            {players.length > 0 && (
              <div className="text-center">
                <div className={`inline-block px-6 py-3 border-4 border-black shadow-[6px_6px_0px_#000] font-black text-xl transform rotate-1 ${
                  canProceedToDraft ? 'bg-green-400 text-black' : 'bg-gray-300 text-gray-600'
                }`}>
                  {canProceedToDraft 
                    ? `READY TO DRAFT! (${players.length} PLAYERS)` 
                    : `NEED ${(parseInt(gameFormat.charAt(0)) * 2) - players.length} MORE PLAYERS`
                  }
                </div>
                
                {canProceedToDraft && (
                  <div className="mt-6">
                    <Button
                      onClick={() => setCurrentPhase("draft")}
                      className="bg-orange-500 hover:bg-orange-600 text-black border-4 border-black shadow-[8px_8px_0px_#000] text-3xl font-black px-12 py-6 transform -rotate-2"
                    >
                      START DRAFT!
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Draft Phase */}
        {currentPhase === "draft" && (
          <div className="grid lg:grid-cols-2 gap-8">
            <SpinningWheel
              players={availablePlayers}
              onPlayerSelected={handlePlayerSelected}
              isSpinning={isSpinning}
              selectedPlayer={selectedPlayer}
              canSpin={!isSpinning && availablePlayers.length > 0}
              onSpin={handleSpin}
            />
            
            <TeamDisplay
              teams={teams}
              gameFormat={gameFormat}
              onReshuffle={handleReshuffle}
              onExport={handleExport}
              isComplete={draftComplete}
            />
          </div>
        )}

        {/* Results Phase */}
        {currentPhase === "results" && (
          <TeamDisplay
            teams={teams}
            gameFormat={gameFormat}
            onReshuffle={handleReshuffle}
            onExport={handleExport}
            isComplete={true}
          />
        )}

        {/* Spin Button for Draft Phase */}
        {currentPhase === "draft" && availablePlayers.length > 0 && !draftComplete && (
          <div className="text-center mt-8">
            <Button
              onClick={handleSpin}
              disabled={isSpinning}
              className={`
                text-4xl font-black px-16 py-8 border-4 border-black shadow-[12px_12px_0px_#000] transform -rotate-1 transition-all duration-200
                ${isSpinning 
                  ? 'bg-gray-400 cursor-not-allowed' 
                  : 'bg-cyan-500 hover:bg-cyan-600 hover:shadow-[16px_16px_0px_#000] hover:scale-105'
                }
                text-black
              `}
            >
              {isSpinning ? (
                <>
                  <RotateCcw size={32} className="animate-spin mr-4" />
                  SPINNING...
                </>
              ) : (
                "🏀 SPIN THE WHEEL! 🏀"
              )}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
