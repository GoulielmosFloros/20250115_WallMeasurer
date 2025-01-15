import * as OBC from "@thatopen/components";
import * as FRAGS from "@thatopen/fragments";
import * as THREE from "three";
import * as OBF from "@thatopen/components-front";

export class WallMeasurement extends OBC.Component {
  static uuid = "a5fc1ead-d314-4171-8927-13ab3926b7db" as const;
  enabled = true;
  // Create a new private property named _objects. Make it an array of FragmentMesh, and initialize it empty.
  private _objects: FRAGS.FragmentMesh[] = [];

  constructor(components: OBC.Components) {
    super(components);
    components.add(WallMeasurement.uuid, this);

    // Get an instance of the LengthMeasurement component
    const lengthMeasurementComponent = components.get(OBF.LengthMeasurement);

    // Add a new callback to the onCleaned event
    lengthMeasurementComponent.onCleaned.remove(() => {
      // Set the _objects property to an empty array when onCleaned is triggered
      this._objects = [];
    });
  }

  measure(object: FRAGS.FragmentMesh, faceIndex: number, instanceId: number) {
    // If the _objects property includes the object passed in the arguments. If it does, return the function.
    if (this._objects.includes(object)) return;
    console.log("triggered");
    // The measuring will start by getting the face data of the element
    // where we want to perform the action.
    // The data will come really easily from a raycast.
    const measurements = this.components.get(OBC.MeasurementUtils);
    const faceData = measurements.getFace(object, faceIndex, instanceId);
    if (!faceData) return;

    // The face data includes the edges. From it, we are mapping to extract
    // just the points. With them, we can create ThreeJS lines to support
    // the operations.
    const edges = faceData.edges.map(({ points }) => points);

    // The edges includes all of them.
    // As the measurement will be along the wall axis, we only care about
    // vertical edges.
    const verticalEdges = edges.filter(([start, end]) => {
      const line = new THREE.Line3(start, end);
      // Using the edge direction, we can now if it is vertical or not.
      // Its just a matter of checking if both X and Z components are 0.
      // That's because in ThreeJS the Y axis is the vertical one.
      const direction = new THREE.Vector3();
      line.delta(direction);
      direction.round();
      return direction.x === 0 && direction.z === 0;
    });

    // We must have an starting point for the measuring.
    // One can be get from the largest vertical edge middle point.
    // The largest edge for a wall will be typically one from the sides.
    const largestEdge = verticalEdges.reduce((prev, current) => {
      const previousLine = new THREE.Line3(prev[0], prev[1]);
      const currentLine = new THREE.Line3(current[0], current[1]);
      // The distance is just the line length.
      if (currentLine.distance() > previousLine.distance()) return current;
      return prev;
    });

    // Here, we just get the center of the largest edge using the Line3
    const largestLine = new THREE.Line3(largestEdge[0], largestEdge[1]);
    const measureStart = new THREE.Vector3();
    largestLine.getCenter(measureStart);

    // Once the vertical edges are in place and we know where the
    // measuring will start, we have to project the measure start to
    // all the other vertical edges.
    // This will give the points that will be used as the measuring points.
    const projections = verticalEdges
      .map(([start, end]) => {
        const line = new THREE.Line3(start, end);
        // closestsPointToPointParameter projects a point into a line.
        // The result is a normalized distance from the line start to the
        // place where the point was projected.
        const parameter = line.closestPointToPointParameter(measureStart);
        const point = new THREE.Vector3();
        // The at method gives you the projected point based on the normalized
        // distance (parameter)
        line.at(parameter, point);
        return point;
      })
      // Then, is very important to sort the projection points based on the
      // distance to the start point.
      // That is because that way is easier to take the points that will be use
      // for each measuring line. They will be the points at index 0 and 1, then
      // the ones at index 1 and 2, and so on.
      .sort((a, b) => {
        const aDistance = new THREE.Line3(measureStart, a).distance();
        const bDistance = new THREE.Line3(measureStart, b).distance();
        return aDistance - bDistance;
      });

    // We can use the length measurement component to create measuring lines
    const lengthMeasurement = this.components.get(OBF.LengthMeasurement);
    for (const [index, projection] of projections.entries()) {
      // Based on the current index, we take the next projetion point.
      // If none is returned, surely we are iterating the last point
      // and thus it won't have any dimensioning line.
      const nextPoint = projections[index + 1];
      if (!nextPoint) continue;
      // Finally, just create the measurement from the current projection point
      // and the next one.
      lengthMeasurement.createOnPoints(projection, nextPoint);
    }
    // Add the object passed in the arguments to the _objects property in the component.
    this._objects.push(object);
  }
}
